"""
Services — app communaute, module Fan-Club (2026-09-24, retour utilisateur : renommer
"Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
Africain, voir docstring de tête de models.py).

Synchronisation périodique de `ClassementLigue`/`RencontreCalendrier` depuis l'API
gratuite API-Football (https://www.api-football.com/documentation-v3) — décision
"hybride" validée avec l'utilisateur : aucune API gratuite ne fournit de données EN DIRECT
(live in-play) pour la Ligue 1 tunisienne, seul le classement/calendrier (données
rafraîchies toutes les quelques heures, pas seconde par seconde) est disponible
gratuitement. Le Live-Ticker (score/chrono/événements pendant un match) reste donc piloté
manuellement par un modérateur (voir `Match`/`MatchEvenement` dans models.py) — ce service
ne les touche jamais.

Remplace TheSportsDB (bascule décidée le 2026-09-24) : la clé publique gratuite de
TheSportsDB s'est révélée, une fois testée en conditions réelles, limitée à l'équipe
"Arsenal" pour la recherche d'équipe et à la Premier League pour les tableaux de
classement — inutilisable pour la Ligue 1 tunisienne/Club Africain. La page de couverture
officielle d'API-Football confirme que toutes les compétitions (dont la Tunisie) sont
incluses dans tous les plans, y compris le plan gratuit (seul le volume de requêtes,
100/jour, diffère des plans payants) — largement suffisant pour une synchronisation toutes
les 6 heures (~30 requêtes/jour, voir migrations/0007_planifier_synchronisation_football.py).

`API_FOOTBALL_KEY` (voir config/settings/base.py, jamais de secret en dur — CLAUDE.md §8)
doit être obtenue par l'utilisateur lui-même (compte gratuit sur
https://dashboard.api-football.com/register, aucune carte bancaire requise) : sans clé,
les fonctions ci-dessous ne font rien (log d'avertissement) plutôt que d'échouer
bruyamment — permet de déployer le module avant que la clé ne soit configurée.

Contrairement à TheSportsDB (identifiant de ligue fixe en configuration), API-Football
résout l'équipe ET sa ligue dynamiquement à chaque synchronisation (recherche par nom
d'équipe puis par pays de la ligue, voir `_resoudre_equipe`/`_resoudre_ligue`) — évite à
l'utilisateur d'avoir à connaître/maintenir un identifiant numérique de ligue, et
détecte automatiquement le changement de saison (`saison courante` déclarée par
l'API) sauf si `API_FOOTBALL_SAISON` est explicitement renseignée.

Chaque synchronisation est idempotente (`update_or_create`) et résiliente : une erreur sur
UNE équipe/UN événement (réponse API inattendue, champ manquant) est capturée et journalisée
sans interrompre le reste de la synchronisation — même principe défensif que les envois email
protégés par try/except dans tasks.py (apps.evenements, apps.communaute).
"""

import logging
from datetime import datetime

import requests
from django.conf import settings
from django.utils import timezone as django_timezone

from .models import ClassementLigue, RencontreCalendrier

logger = logging.getLogger(__name__)

API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"
TIMEOUT_SECONDES = 15

# API-Football renvoie la forme récente en anglais (W/D/L) — le frontend (StatistiquesTab,
# COULEUR_FORME) et les données déjà en base attendent les codes français historiquement
# utilisés par TheSportsDB (V/N/D) : traduction systématique à l'ingestion plutôt que de
# propager l'anglais jusqu'à l'UI.
_TRADUCTION_FORME = {"W": "V", "D": "N", "L": "D"}


def _api_key_configuree() -> bool:
    if not settings.API_FOOTBALL_KEY:
        logger.warning(
            "API_FOOTBALL_KEY non configurée — synchronisation Fan-Club ignorée "
            "(voir .env.example)."
        )
        return False
    return True


def _headers() -> dict:
    return {"x-apisports-key": settings.API_FOOTBALL_KEY}


def _get(chemin: str, params: dict) -> list:
    """GET générique — lève sur erreur réseau/HTTP, retourne toujours la liste
    `response` (jamais None) du corps JSON API-Football."""
    reponse = requests.get(
        f"{API_FOOTBALL_BASE_URL}/{chemin}",
        headers=_headers(),
        params=params,
        timeout=TIMEOUT_SECONDES,
    )
    reponse.raise_for_status()
    return reponse.json().get("response") or []


def _traduire_forme(forme: str) -> str:
    return "".join(_TRADUCTION_FORME.get(lettre, lettre) for lettre in (forme or ""))[:10]


def _resoudre_equipe() -> int | None:
    """Cherche l'équipe configurée (API_FOOTBALL_EQUIPE) par nom. Retourne son
    identifiant API-Football, ou None si introuvable/erreur réseau."""
    try:
        resultats = _get("teams", {"search": settings.API_FOOTBALL_EQUIPE})
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec recherche équipe API-Football : %s", exc)
        return None
    if not resultats:
        logger.warning("Équipe API-Football introuvable : %s", settings.API_FOOTBALL_EQUIPE)
        return None
    try:
        return resultats[0]["team"]["id"]
    except (KeyError, TypeError, IndexError) as exc:
        logger.warning("Réponse teams API-Football au format inattendu : %s", exc)
        return None


def _resoudre_ligue(team_id: int) -> tuple[int, str] | tuple[None, None]:
    """Parmi toutes les compétitions où l'équipe est enregistrée, retient la ligue
    nationale (type "League", pays API_FOOTBALL_PAYS — exclut coupes/compétitions
    continentales). Retourne (league_id, saison au format "AAAA-AAAA") ou (None, None)."""
    try:
        lignes = _get("leagues", {"team": team_id})
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec récupération des ligues API-Football : %s", exc)
        return None, None

    pays = settings.API_FOOTBALL_PAYS.lower()
    candidates = [
        ligne
        for ligne in lignes
        if (ligne.get("league") or {}).get("type") == "League"
        and (ligne.get("country") or {}).get("name", "").lower() == pays
    ]
    if not candidates:
        logger.warning("Aucune ligue nationale API-Football trouvée pour %s", pays)
        return None, None

    ligue = candidates[0].get("league") or {}
    try:
        league_id = ligue["id"]
    except KeyError:
        logger.warning("Ligue API-Football sans identifiant : %s", ligue)
        return None, None

    if settings.API_FOOTBALL_SAISON:
        annee = settings.API_FOOTBALL_SAISON
    else:
        saisons = candidates[0].get("seasons") or []
        courante = next((s for s in saisons if s.get("current")), None)
        if not courante or "year" not in courante:
            logger.warning("Aucune saison courante API-Football pour la ligue %s", league_id)
            return None, None
        annee = courante["year"]

    try:
        annee_int = int(annee)
    except (TypeError, ValueError):
        logger.warning("Saison API-Football au format inattendu : %s", annee)
        return None, None

    return league_id, f"{annee_int}-{annee_int + 1}"


def synchroniser_classement() -> int:
    """Résout l'équipe/la ligue configurées puis met à jour `ClassementLigue` (upsert par
    saison+équipe) à partir du classement API-Football. Retourne le nombre de lignes
    synchronisées avec succès (0 si la clé API n'est pas configurée ou si un appel échoue)."""
    if not _api_key_configuree():
        return 0

    team_id = _resoudre_equipe()
    if team_id is None:
        return 0
    league_id, saison = _resoudre_ligue(team_id)
    if league_id is None:
        return 0

    try:
        annee = int(saison.split("-")[0])
        resultats = _get("standings", {"league": league_id, "season": annee})
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec récupération classement API-Football : %s", exc)
        return 0

    try:
        groupes = ((resultats[0].get("league") or {}).get("standings") or []) if resultats else []
    except (KeyError, TypeError, IndexError) as exc:
        logger.warning("Réponse standings API-Football au format inattendu : %s", exc)
        return 0

    synchronisees = 0
    for groupe in groupes:
        for ligne in groupe:
            try:
                stats = ligne.get("all") or {}
                buts = stats.get("goals") or {}
                ClassementLigue.objects.update_or_create(
                    saison=saison,
                    equipe=ligne["team"]["name"],
                    defaults={
                        "rang": int(ligne.get("rank") or 0),
                        "joues": int(stats.get("played") or 0),
                        "victoires": int(stats.get("win") or 0),
                        "nuls": int(stats.get("draw") or 0),
                        "defaites": int(stats.get("lose") or 0),
                        "buts_pour": int(buts.get("for") or 0),
                        "buts_contre": int(buts.get("against") or 0),
                        "difference": int(ligne.get("goalsDiff") or 0),
                        "points": int(ligne.get("points") or 0),
                        "forme_recente": _traduire_forme(ligne.get("form") or ""),
                    },
                )
                synchronisees += 1
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning(
                    "Ligne de classement API-Football ignorée (format inattendu) : %s", exc
                )

    return synchronisees


def _synchroniser_evenements(evenements: list[dict]) -> int:
    synchronisees = 0
    for evenement in evenements:
        try:
            fixture = evenement["fixture"]
            event_id = str(fixture["id"])
            # API-Football renvoie "date" en ISO 8601 avec décalage explicite (ex.
            # "2026-10-05T18:00:00+00:00") — fromisoformat() donne directement un
            # datetime "aware", pas d'assemblage manuel de chaîne nécessaire (contrairement
            # à TheSportsDB). Filet de sécurité make_aware si jamais la chaîne est naïve.
            date_heure = datetime.fromisoformat(fixture["date"])
            if django_timezone.is_naive(date_heure):
                date_heure = django_timezone.make_aware(date_heure, django_timezone.utc)

            equipes = evenement.get("teams") or {}
            buts = evenement.get("goals") or {}
            score_domicile = buts.get("home")
            score_exterieur = buts.get("away")

            RencontreCalendrier.objects.update_or_create(
                evenement_externe_id=event_id,
                defaults={
                    "competition": (evenement.get("league") or {}).get("name") or "",
                    "equipe_domicile": equipes["home"]["name"],
                    "equipe_exterieur": equipes["away"]["name"],
                    "date_heure": date_heure,
                    "score_domicile": int(score_domicile) if score_domicile is not None else None,
                    "score_exterieur": (
                        int(score_exterieur) if score_exterieur is not None else None
                    ),
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Rencontre API-Football ignorée (format inattendu) : %s", exc)
    return synchronisees


def synchroniser_calendrier() -> int:
    """Résout l'équipe/la ligue configurées puis met à jour `RencontreCalendrier` (upsert
    par evenement_externe_id) à partir des prochaines et dernières rencontres de l'équipe.
    Retourne le nombre de rencontres synchronisées avec succès."""
    if not _api_key_configuree():
        return 0

    team_id = _resoudre_equipe()
    if team_id is None:
        return 0
    league_id, saison = _resoudre_ligue(team_id)
    if league_id is None:
        return 0
    annee = int(saison.split("-")[0])

    synchronisees = 0
    for cle, valeur in (("next", 10), ("last", 10)):
        try:
            evenements = _get(
                "fixtures",
                {"team": team_id, "league": league_id, "season": annee, cle: valeur},
            )
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Échec récupération calendrier API-Football (%s) : %s", cle, exc)
            continue
        synchronisees += _synchroniser_evenements(evenements)

    return synchronisees

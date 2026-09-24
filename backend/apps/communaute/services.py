"""
Services — app communaute, module Fan-Club (2026-09-24, retour utilisateur : renommer
"Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
Africain, voir docstring de tête de models.py).

Synchronisation périodique de `ClassementLigue`/`RencontreCalendrier` depuis l'API
gratuite TheSportsDB (https://www.thesportsdb.com/api.php) — décision "hybride" validée
avec l'utilisateur : aucune API gratuite ne fournit de données EN DIRECT (live in-play)
pour la Ligue 1 tunisienne, seul le classement/calendrier (données rafraîchies toutes les
quelques heures, pas seconde par seconde) est disponible gratuitement. Le Live-Ticker
(score/chrono/événements pendant un match) reste donc piloté manuellement par un
modérateur (voir `Match`/`MatchEvenement` dans models.py) — ce service ne les touche
jamais.

`THESPORTSDB_API_KEY` (voir config/settings/base.py, jamais de secret en dur — CLAUDE.md
§8) doit être obtenue par l'utilisateur lui-même (compte gratuit sur
https://www.thesportsdb.com/free_api.php) : sans clé, les fonctions ci-dessous ne font
rien (log d'avertissement) plutôt que d'échouer bruyamment — permet de déployer le module
avant que la clé ne soit configurée.

Chaque synchronisation est idempotente (`update_or_create`) et résiliente : une erreur sur
UNE équipe/UN événement (réponse API inattendue, champ manquant) est capturée et journalisée
sans interrompre le reste de la synchronisation — même principe défensif que les envois email
protégés par try/except dans tasks.py (apps.evenements, apps.communaute).
"""

import logging
from datetime import datetime, timezone as datetime_timezone

import requests
from django.conf import settings
from django.utils import timezone as django_timezone

from .models import ClassementLigue, RencontreCalendrier

logger = logging.getLogger(__name__)

THESPORTSDB_BASE_URL = "https://www.thesportsdb.com/api/v1/json"
TIMEOUT_SECONDES = 15


def _api_key_configuree() -> bool:
    if not settings.THESPORTSDB_API_KEY:
        logger.warning(
            "THESPORTSDB_API_KEY non configurée — synchronisation Fan-Club ignorée "
            "(voir .env.example)."
        )
        return False
    return True


def _url(chemin: str) -> str:
    return f"{THESPORTSDB_BASE_URL}/{settings.THESPORTSDB_API_KEY}/{chemin}"


def synchroniser_classement() -> int:
    """Récupère le classement de la ligue configurée (THESPORTSDB_LEAGUE_ID/SAISON) et
    met à jour `ClassementLigue` (upsert par saison+équipe). Retourne le nombre de lignes
    synchronisées avec succès (0 si la clé API n'est pas configurée ou si l'appel échoue)."""
    if not _api_key_configuree():
        return 0

    try:
        reponse = requests.get(
            _url("lookuptable.php"),
            params={"l": settings.THESPORTSDB_LEAGUE_ID, "s": settings.THESPORTSDB_SAISON},
            timeout=TIMEOUT_SECONDES,
        )
        reponse.raise_for_status()
        lignes = reponse.json().get("table") or []
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec récupération classement TheSportsDB : %s", exc)
        return 0

    synchronisees = 0
    for ligne in lignes:
        try:
            ClassementLigue.objects.update_or_create(
                saison=settings.THESPORTSDB_SAISON,
                equipe=ligne["strTeam"],
                defaults={
                    "rang": int(ligne.get("intRank") or 0),
                    "joues": int(ligne.get("intPlayed") or 0),
                    "victoires": int(ligne.get("intWin") or 0),
                    "nuls": int(ligne.get("intDraw") or 0),
                    "defaites": int(ligne.get("intLoss") or 0),
                    "buts_pour": int(ligne.get("intGoalsFor") or 0),
                    "buts_contre": int(ligne.get("intGoalsAgainst") or 0),
                    "difference": int(ligne.get("intGoalDifference") or 0),
                    "points": int(ligne.get("intPoints") or 0),
                    "forme_recente": (ligne.get("strForm") or "")[:10],
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Ligne de classement TheSportsDB ignorée (format inattendu) : %s", exc)

    return synchronisees


def _synchroniser_evenements(evenements: list[dict]) -> int:
    synchronisees = 0
    for evenement in evenements:
        try:
            event_id = evenement["idEvent"]
            score_domicile = evenement.get("intHomeScore")
            score_exterieur = evenement.get("intAwayScore")
            # TheSportsDB renvoie dateEvent/strTime sans indicateur de fuseau — toujours en
            # UTC (convention documentée de l'API) : `make_aware(..., utc)` plutôt qu'un
            # simple assemblage de chaîne, pour ne jamais persister un datetime naïf
            # (USE_TZ=True, voir config/settings/base.py).
            naive = datetime.strptime(
                f"{evenement['dateEvent']} {evenement.get('strTime') or '00:00:00'}",
                "%Y-%m-%d %H:%M:%S",
            )
            date_heure = django_timezone.make_aware(naive, datetime_timezone.utc)
            RencontreCalendrier.objects.update_or_create(
                thesportsdb_event_id=event_id,
                defaults={
                    "competition": evenement.get("strLeague") or "",
                    "equipe_domicile": evenement["strHomeTeam"],
                    "equipe_exterieur": evenement["strAwayTeam"],
                    "date_heure": date_heure,
                    "score_domicile": int(score_domicile) if score_domicile not in (None, "") else None,
                    "score_exterieur": int(score_exterieur) if score_exterieur not in (None, "") else None,
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Rencontre TheSportsDB ignorée (format inattendu) : %s", exc)
    return synchronisees


def synchroniser_calendrier() -> int:
    """Récupère les prochaines et dernières rencontres de l'équipe configurée
    (THESPORTSDB_EQUIPE) et met à jour `RencontreCalendrier` (upsert par
    thesportsdb_event_id). Retourne le nombre de rencontres synchronisées avec succès."""
    if not _api_key_configuree():
        return 0

    try:
        reponse_equipe = requests.get(
            _url("searchteams.php"),
            params={"t": settings.THESPORTSDB_EQUIPE},
            timeout=TIMEOUT_SECONDES,
        )
        reponse_equipe.raise_for_status()
        equipes = reponse_equipe.json().get("teams") or []
        if not equipes:
            logger.warning("Équipe TheSportsDB introuvable : %s", settings.THESPORTSDB_EQUIPE)
            return 0
        team_id = equipes[0]["idTeam"]
    except (requests.RequestException, ValueError, KeyError, IndexError) as exc:
        logger.warning("Échec recherche équipe TheSportsDB : %s", exc)
        return 0

    synchronisees = 0
    for chemin in ("eventsnext.php", "eventslast.php"):
        try:
            reponse = requests.get(_url(chemin), params={"id": team_id}, timeout=TIMEOUT_SECONDES)
            reponse.raise_for_status()
            corps = reponse.json()
            evenements = corps.get("events") or corps.get("results") or []
        except (requests.RequestException, ValueError) as exc:
            logger.warning("Échec récupération calendrier TheSportsDB (%s) : %s", chemin, exc)
            continue
        synchronisees += _synchroniser_evenements(evenements)

    return synchronisees

"""
Services — app communaute, module Fan-Club (2026-09-24, retour utilisateur : renommer
"Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
Africain, voir docstring de tête de models.py).

Synchronisation périodique de `ClassementLigue`/`RencontreCalendrier` depuis le panneau
Sports de Google, interrogé via SerpApi (https://serpapi.com/google-sports-api) — décision
"hybride" toujours valide : aucune API gratuite ne fournit de données EN DIRECT (live
in-play) pour la Ligue 1 tunisienne, seuls le classement/calendrier (données rafraîchies
1x/jour) sont disponibles gratuitement. Le Live-Ticker (score/chrono/événements pendant un
match) reste donc piloté manuellement par un modérateur (voir `Match`/`MatchEvenement` dans
models.py) — ce service ne les touche jamais.

Remplace API-Football (bascule décidée le 2026-09-24, quelques heures après le
remplacement de TheSportsDB par API-Football le même jour) : testé en conditions réelles
sur Railway (Django shell, clé réelle de l'utilisateur), le plan gratuit d'API-Football
bloque l'accès aux saisons récentes/en cours (`{"errors": {"plan": "Free plans do not
have access to this season, try from 2022 to 2024."}}`) — inutilisable pour un module qui
doit justement afficher la saison EN COURS.

Conçu à partir de plusieurs séries de tests ad-hoc (à la demande explicite de
l'utilisateur, AVANT toute implémentation, avec sa clé SerpApi réelle depuis la console
Railway) qui ont révélé qu'une SEULE requête Google (`engine=google`, jamais besoin d'un
identifiant Knowledge Graph/`kgmid` obtenu séparément) ne suffit PAS à tout couvrir — le
panneau Sports de Google se comporte différemment selon la requête :
  - "<ligue> standings"/"table" → tableau COMPLET (16 équipes testées) mais AUCUN match.
  - "<ligue> results" → plusieurs matchs RÉCEMMENT JOUÉS avec score réel par équipe
    (`status: "FT"`) — permet enfin de renseigner score_domicile/score_exterieur.
  - "<équipe> schedule" → le PROCHAIN match de l'équipe (toutes compétitions confondues,
    pas seulement le championnat national) — utile pour "à venir" même quand la ligue
    elle-même est entre deux journées.
Aucune formulation ne renvoie la liste COMPLÈTE des matchs d'une saison (~30 par équipe) —
limite du panneau Sports de Google lui-même (identique à ce qu'un navigateur affiche pour
la même recherche), pas de SerpApi. Le calendrier synchronisé reste donc volontairement
partiel : derniers résultats connus + prochain match, jamais l'intégralité du calendrier.

Trois requêtes SerpApi par synchronisation (`_recherche_classement`,
`_recherche_resultats_recents`, `_recherche_prochain_match`, voir `synchroniser_classement`/
`synchroniser_calendrier`) — décision utilisateur du 2026-09-24 (revue le même jour après
avoir d'abord tenté une requête unique mutualisée, insuffisante en pratique) : planifiée
1x/jour (migrations/0007, mis à jour par migrations/0008) pour rester large sous le quota
gratuit SerpApi (250 recherches/mois — 3 requêtes/jour ≈ 90/mois).

`SERPAPI_KEY` (voir config/settings/base.py, jamais de secret en dur — CLAUDE.md §8) doit
être obtenue par l'utilisateur lui-même (compte gratuit sur https://serpapi.com/users/sign_up,
250 recherches/mois sans carte bancaire) : sans clé, les fonctions ci-dessous ne font rien
(log d'avertissement) plutôt que d'échouer bruyamment — permet de déployer le module avant
que la clé ne soit configurée.

SerpApi ne renvoie ni saison explicite fiable (le champ "season" n'apparaît que sur
certaines formulations de requête) ni identifiant de ligue/équipe à résoudre au préalable
(contrairement à API-Football) : la saison est calculée localement (convention
"juillet → juin" pour un championnat nord-africain/européen), avec un override optionnel
`SERPAPI_SAISON` en cas de bascule ambiguë. Chaque rencontre est identifiée par son
`kgmid` Google (ex. "/g/11zypstbsb"), utilisé comme `evenement_externe_id` (champ déjà
générique, aucune migration de schéma nécessaire).

Chaque synchronisation est idempotente (`update_or_create`) et résiliente : une erreur sur
UNE équipe/UN événement (réponse API inattendue, champ manquant) est capturée et journalisée
sans interrompre le reste de la synchronisation — même principe défensif que les envois email
protégés par try/except dans tasks.py (apps.evenements, apps.communaute).
"""

import logging
from datetime import date, datetime

import requests
from django.conf import settings
from django.utils import timezone as django_timezone

from .models import ClassementLigue, RencontreCalendrier

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search.json"
TIMEOUT_SECONDES = 15

# SerpApi (panneau Sports Google) renvoie la forme récente en anglais, y compris des
# entrées "not played" pour les matchs futurs affichés en avance dans last_5 — traduites en
# chaîne vide (silencieusement ignorées) plutôt que propagées telles quelles, le frontend
# (StatistiquesTab, COULEUR_FORME) n'attendant que des lettres V/N/D.
_TRADUCTION_FORME = {"win": "V", "tie": "N", "loss": "D"}

_MOIS_ABBR = {
    "Jan": 1,
    "Feb": 2,
    "Mar": 3,
    "Apr": 4,
    "May": 5,
    "Jun": 6,
    "Jul": 7,
    "Aug": 8,
    "Sep": 9,
    "Oct": 10,
    "Nov": 11,
    "Dec": 12,
}

# "<ligue> results" renvoie des dates préfixées du jour de semaine (ex. "Sun, Sep 20"),
# contrairement à "<équipe> schedule" (ex. "Oct 17" sans préfixe) — préfixe retiré avant
# parsing, voir _parser_date_heure.
_JOURS_ABBR = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}


def _api_key_configuree() -> bool:
    if not settings.SERPAPI_KEY:
        logger.warning(
            "SERPAPI_KEY non configurée — synchronisation Fan-Club ignorée (voir .env.example)."
        )
        return False
    return True


def _get_sports_results(query: str) -> dict | None:
    """Un appel SerpApi (`engine=google`) pour la requête donnée. `hl=en`/`gl=us` forcés
    pour un format de réponse anglais stable (dates "Oct 17"/"Sun, Sep 20", pas
    d'arabe/français à parser)."""
    try:
        reponse = requests.get(
            SERPAPI_URL,
            params={
                "engine": "google",
                "q": query,
                "hl": "en",
                "gl": "us",
                "api_key": settings.SERPAPI_KEY,
            },
            timeout=TIMEOUT_SECONDES,
        )
        reponse.raise_for_status()
        corps = reponse.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec requête SerpApi (%s) : %s", query, exc)
        return None

    if corps.get("error"):
        logger.warning("Erreur SerpApi (%s) : %s", query, corps["error"])
        return None

    resultats = corps.get("sports_results")
    if not resultats:
        logger.warning("Aucun sports_results SerpApi pour la requête : %s", query)
        return None
    return resultats


def _traduire_forme(derniers) -> str:
    return "".join(_TRADUCTION_FORME.get(resultat, "") for resultat in (derniers or []))


def _saison_actuelle() -> str:
    """SerpApi ne renvoie pas de façon fiable un champ "season" exploitable : calculée
    localement selon la convention "juillet → juin" d'une saison de football, sauf
    override explicite `SERPAPI_SAISON` (année de début, ex. "2025" pour 2025-2026)."""
    if settings.SERPAPI_SAISON:
        try:
            annee = int(settings.SERPAPI_SAISON)
            return f"{annee}-{annee + 1}"
        except ValueError:
            logger.warning("SERPAPI_SAISON invalide, ignorée : %s", settings.SERPAPI_SAISON)

    aujourdhui = django_timezone.localdate()
    annee_debut = aujourdhui.year if aujourdhui.month >= 7 else aujourdhui.year - 1
    return f"{annee_debut}-{annee_debut + 1}"


def _parser_date_heure(date_str: str, heure_str: str):
    """SerpApi ne renvoie jamais l'année (ex. date="Oct 17" ou "Sun, Sep 20",
    time="11:00 AM" ou absent) — et le jour/mois seuls sont ambigus selon la requête
    d'origine : "<ligue> results" renvoie des matchs RÉCEMMENT PASSÉS (quelques jours avant
    aujourd'hui), "<équipe> schedule" un match À VENIR (quelques jours/semaines après). Les
    deux ne s'écartent jamais de plusieurs mois d'aujourd'hui (limite du panneau Sports de
    Google lui-même, voir docstring de tête) : on retient donc, parmi les trois
    interprétations possibles (année-1/année/année+1), celle dont la date obtenue est la
    PLUS PROCHE d'aujourd'hui — fonctionne aussi bien pour un résultat de quelques jours
    dans le passé que pour un prochain match de quelques semaines dans le futur, y compris
    à la bascule de fin d'année (ex. "Jan 3" trouvé en décembre désigne l'année suivante).
    Retourne None si le format est illisible."""
    if not date_str:
        return None
    morceaux = date_str.replace(",", "").split()
    if morceaux and morceaux[0] in _JOURS_ABBR:
        morceaux = morceaux[1:]
    if len(morceaux) != 2 or morceaux[0] not in _MOIS_ABBR:
        return None
    mois = _MOIS_ABBR[morceaux[0]]
    try:
        jour = int(morceaux[1])
    except ValueError:
        return None

    aujourdhui = django_timezone.localdate()
    candidats = []
    for annee_possible in (aujourdhui.year - 1, aujourdhui.year, aujourdhui.year + 1):
        try:
            candidats.append(date(annee_possible, mois, jour))
        except ValueError:
            continue
    if not candidats:
        return None
    candidate = min(candidats, key=lambda d: abs((d - aujourdhui).days))
    annee = candidate.year

    # Heure de coup d'envoi inconnue ("<ligue> results" ne la renvoie jamais, seul le
    # statut "FT") : midi plutôt que minuit — minuit heure locale (Europe/Berlin) tombe la
    # veille une fois converti en UTC (stockage USE_TZ=True), ce qui décalerait la date
    # affichée d'un jour ; midi reste toujours le même jour calendaire dans les deux fuseaux.
    heure, minute = 12, 0
    if heure_str:
        try:
            heure_parsee = datetime.strptime(heure_str.strip(), "%I:%M %p")
            heure, minute = heure_parsee.hour, heure_parsee.minute
        except ValueError:
            pass

    naif = datetime(annee, mois, jour, heure, minute)
    return django_timezone.make_aware(naif)


def _score_equipe(equipe: dict):
    """`score` n'est présent que sur un match terminé ("status": "FT") — absent (postposé,
    à venir) : None plutôt que de lever, voir _synchroniser_calendrier_depuis."""
    score = equipe.get("score")
    if score is None:
        return None
    try:
        return int(score)
    except (TypeError, ValueError):
        return None


def _synchroniser_classement_depuis(resultats: dict) -> int:
    lignes = ((resultats.get("league") or {}).get("standings")) or []
    saison = _saison_actuelle()

    synchronisees = 0
    for ligne in lignes:
        try:
            ClassementLigue.objects.update_or_create(
                saison=saison,
                equipe=ligne["team"]["name"],
                defaults={
                    "rang": int(ligne.get("pos") or 0),
                    "joues": int(ligne.get("mp") or 0),
                    "victoires": int(ligne.get("w") or 0),
                    "nuls": int(ligne.get("d") or 0),
                    "defaites": int(ligne.get("l") or 0),
                    "buts_pour": int(ligne.get("gf") or 0),
                    "buts_contre": int(ligne.get("ga") or 0),
                    "difference": int(ligne.get("gd") or 0),
                    "points": int(ligne.get("pts") or 0),
                    "forme_recente": _traduire_forme(ligne.get("last_5")),
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Ligne de classement SerpApi ignorée (format inattendu) : %s", exc)

    return synchronisees


def _synchroniser_calendrier_depuis(resultats: dict) -> int:
    """Traite indifféremment les `games` d'une réponse "results" (matchs terminés, score
    présent par équipe) ou "schedule" (prochain match, généralement sans score) — même
    forme de bloc `games`, seule la présence du score diffère. Convention observée sur les
    données réelles : teams[0] = équipe à domicile, teams[1] = équipe à l'extérieur."""
    jeux = resultats.get("games") or []

    synchronisees = 0
    for jeu in jeux:
        try:
            event_id = jeu["kgmid"]
            equipes = jeu["teams"]
            if len(equipes) != 2:
                raise ValueError("nombre d'équipes inattendu")
            date_heure = _parser_date_heure(jeu.get("date", ""), jeu.get("time", ""))
            if date_heure is None:
                raise ValueError("date SerpApi illisible")

            RencontreCalendrier.objects.update_or_create(
                evenement_externe_id=event_id,
                defaults={
                    "competition": jeu.get("tournament") or "",
                    "equipe_domicile": equipes[0]["name"],
                    "equipe_exterieur": equipes[1]["name"],
                    "date_heure": date_heure,
                    "score_domicile": _score_equipe(equipes[0]),
                    "score_exterieur": _score_equipe(equipes[1]),
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Rencontre SerpApi ignorée (format inattendu) : %s", exc)

    return synchronisees


def synchroniser_classement() -> int:
    """Table complète de la ligue (`SERPAPI_LIGUE`) — une requête SerpApi dédiée, voir
    docstring de tête (une requête sur le nom de l'équipe ne renvoie qu'un extrait de 5
    lignes autour d'elle, jamais le tableau complet)."""
    if not _api_key_configuree():
        return 0
    resultats = _get_sports_results(f"{settings.SERPAPI_LIGUE} standings")
    if not resultats:
        return 0
    return _synchroniser_classement_depuis(resultats)


def synchroniser_calendrier() -> int:
    """Deux requêtes SerpApi : derniers résultats connus de la ligue (avec scores réels) +
    prochain match de l'équipe configurée (`SERPAPI_EQUIPE`, toutes compétitions
    confondues) — voir docstring de tête pour pourquoi la liste complète d'une saison
    n'est pas atteignable."""
    if not _api_key_configuree():
        return 0

    total = 0
    resultats_recents = _get_sports_results(f"{settings.SERPAPI_LIGUE} results")
    if resultats_recents:
        total += _synchroniser_calendrier_depuis(resultats_recents)

    prochain_match = _get_sports_results(f"{settings.SERPAPI_EQUIPE} schedule")
    if prochain_match:
        total += _synchroniser_calendrier_depuis(prochain_match)

    return total


def synchroniser_donnees_football() -> dict:
    """Point d'entrée utilisé par tasks.py/Celery Beat — délègue à
    `synchroniser_classement()`/`synchroniser_calendrier()` (3 appels SerpApi au total,
    voir docstring de tête). Planifié 1x/jour (migrations/0007, mis à jour par
    migrations/0008) pour rester large sous le quota gratuit SerpApi."""
    return {
        "classement": synchroniser_classement(),
        "calendrier": synchroniser_calendrier(),
    }

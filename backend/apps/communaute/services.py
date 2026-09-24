"""
Services — app communaute, module Fan-Club (2026-09-24, retour utilisateur : renommer
"Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
Africain, voir docstring de tête de models.py).

Synchronisation périodique de `ClassementLigue`/`RencontreCalendrier` depuis le panneau
Sports de Google, interrogé via SerpApi (https://serpapi.com/google-sports-api) — décision
"hybride" toujours valide : aucune API gratuite ne fournit de données EN DIRECT (live
in-play) pour la Ligue 1 tunisienne, seuls le classement/calendrier (données rafraîchies
toutes les quelques heures) sont disponibles gratuitement. Le Live-Ticker (score/chrono/
événements pendant un match) reste donc piloté manuellement par un modérateur (voir
`Match`/`MatchEvenement` dans models.py) — ce service ne les touche jamais.

Remplace API-Football (bascule décidée le 2026-09-24, quelques heures après le
remplacement de TheSportsDB par API-Football le même jour) : testé en conditions réelles
sur Railway (Django shell, clé réelle de l'utilisateur), le plan gratuit d'API-Football
bloque l'accès aux saisons récentes/en cours (`{"errors": {"plan": "Free plans do not
have access to this season, try from 2022 to 2024."}}`) — inutilisable pour un module qui
doit justement afficher la saison EN COURS. Testé ad-hoc (à la demande explicite de
l'utilisateur, AVANT toute implémentation) avec la clé SerpApi réelle de l'utilisateur
depuis la console Railway : une recherche Google classique (`engine=google`, PAS besoin
d'un identifiant Knowledge Graph/`kgmid` obtenu séparément) pour "<équipe> schedule" (en
anglais — force un format de réponse stable, dates "Oct 17" plutôt que arabe/français)
renvoie un bloc `sports_results` contenant À LA FOIS le classement complet
(`sports_results.league.standings`) ET les prochains matchs (`sports_results.games`) —
un seul appel HTTP couvre donc `synchroniser_classement()` ET `synchroniser_calendrier()`,
décision retenue avec l'utilisateur le 2026-09-24 pour rester large sous le quota gratuit
SerpApi (250 recherches/mois seulement, contre 100/jour chez API-Football — beaucoup plus
resserré, d'où l'intérêt de mutualiser l'appel). Voir `synchroniser_donnees_football()`,
point d'entrée utilisé par tasks.py/Celery Beat (toutes les 6h, migrations/
0007_planifier_synchronisation_football.py, inchangé) ; `synchroniser_classement()` et
`synchroniser_calendrier()` restent appelables isolément (chacune fait alors son propre
appel HTTP) pour un usage manuel depuis le Django Shell ou pour les tests.

`SERPAPI_KEY` (voir config/settings/base.py, jamais de secret en dur — CLAUDE.md §8) doit
être obtenue par l'utilisateur lui-même (compte gratuit sur https://serpapi.com/users/sign_up,
250 recherches/mois sans carte bancaire) : sans clé, les fonctions ci-dessous ne font rien
(log d'avertissement) plutôt que d'échouer bruyamment — permet de déployer le module avant
que la clé ne soit configurée.

SerpApi ne renvoie ni saison explicite fiable (le champ "season" n'apparaît que sur
certaines formulations de requête, absent de "<équipe> schedule" — voir `_saison_actuelle`)
ni identifiant de ligue/équipe à résoudre au préalable (contrairement à API-Football) : la
saison est calculée localement (convention "juillet → juin" pour un championnat
nord-africain/européen), avec un override optionnel `SERPAPI_SAISON` en cas de bascule
ambiguë. Chaque rencontre à venir est identifiée par son `kgmid` Google (ex. "/g/11zypstbsb"),
utilisé comme `evenement_externe_id` (champ déjà générique, aucune migration nécessaire).

SerpApi ne renvoie pas de score pour les rencontres à venir (`sports_results.games` ne
couvre, avec la requête retenue, que les prochains matchs — jamais de résultats passés) :
`score_domicile`/`score_exterieur` ne sont donc actuellement jamais renseignés par ce
service (onglet "Resultate"/résultats du frontend restera vide tant qu'une requête SerpApi
couvrant les scores passés n'est pas identifiée — compromis accepté avec l'utilisateur le
2026-09-24 au profit d'un seul appel API partagé, voir ci-dessus).

Chaque synchronisation est idempotente (`update_or_create`) et résiliente : une erreur sur
UNE équipe/UN événement (réponse API inattendue, champ manquant) est capturée et journalisée
sans interrompre le reste de la synchronisation — même principe défensif que les envois email
protégés par try/except dans tasks.py (apps.evenements, apps.communaute).
"""

import logging
from datetime import date, datetime, timedelta

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


def _api_key_configuree() -> bool:
    if not settings.SERPAPI_KEY:
        logger.warning(
            "SERPAPI_KEY non configurée — synchronisation Fan-Club ignorée (voir .env.example)."
        )
        return False
    return True


def _rechercher_sports_results() -> dict | None:
    """Unique appel SerpApi partagé par `synchroniser_classement()` et
    `synchroniser_calendrier()` (voir docstring de tête). `hl=en`/`gl=us` forcés pour un
    format de réponse anglais stable (dates "Oct 17", pas d'arabe/français à parser)."""
    try:
        reponse = requests.get(
            SERPAPI_URL,
            params={
                "engine": "google",
                "q": f"{settings.SERPAPI_EQUIPE} schedule",
                "hl": "en",
                "gl": "us",
                "api_key": settings.SERPAPI_KEY,
            },
            timeout=TIMEOUT_SECONDES,
        )
        reponse.raise_for_status()
        corps = reponse.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec requête SerpApi : %s", exc)
        return None

    if corps.get("error"):
        logger.warning("Erreur SerpApi : %s", corps["error"])
        return None

    resultats = corps.get("sports_results")
    if not resultats:
        logger.warning(
            "Aucun sports_results SerpApi pour %s (équipe introuvable dans le panneau "
            "Sports Google, ou requête sans résultat)",
            settings.SERPAPI_EQUIPE,
        )
        return None
    return resultats


def _traduire_forme(derniers) -> str:
    return "".join(_TRADUCTION_FORME.get(resultat, "") for resultat in (derniers or []))


def _saison_actuelle() -> str:
    """SerpApi ne renvoie pas de façon fiable un champ "season" exploitable (absent de la
    réponse à "<équipe> schedule", voir docstring de tête) : calculée localement selon la
    convention "juillet → juin" d'une saison de football, sauf override explicite
    `SERPAPI_SAISON` (année de début, ex. "2025" pour la saison 2025-2026)."""
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
    """SerpApi ne renvoie jamais l'année (ex. date="Oct 17", time="11:00 AM") — comme
    `sports_results.games` ne couvre que les prochains matchs (voir docstring de tête),
    l'année en cours convient, sauf bascule de fin d'année (ex. "Jan 3" trouvé en décembre
    désigne alors l'année suivante) : détectée si la date obtenue avec l'année en cours
    serait déjà passée de plus d'un jour. Retourne None si le format est illisible."""
    if not date_str:
        return None
    morceaux = date_str.replace(",", "").split()
    if len(morceaux) != 2 or morceaux[0] not in _MOIS_ABBR:
        return None
    mois = _MOIS_ABBR[morceaux[0]]
    try:
        jour = int(morceaux[1])
    except ValueError:
        return None

    aujourdhui = django_timezone.localdate()
    annee = aujourdhui.year
    try:
        candidate = date(annee, mois, jour)
    except ValueError:
        return None
    if candidate < aujourdhui - timedelta(days=1):
        annee += 1

    heure, minute = 0, 0
    if heure_str:
        try:
            heure_parsee = datetime.strptime(heure_str.strip(), "%I:%M %p")
            heure, minute = heure_parsee.hour, heure_parsee.minute
        except ValueError:
            pass

    naif = datetime(annee, mois, jour, heure, minute)
    return django_timezone.make_aware(naif)


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
    jeux = resultats.get("games") or []

    synchronisees = 0
    for jeu in jeux:
        try:
            event_id = jeu["kgmid"]
            # Convention observée (test ad-hoc 2026-09-24, deux matchs aller/retour) :
            # teams[0] = équipe à domicile, teams[1] = équipe à l'extérieur.
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
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Rencontre SerpApi ignorée (format inattendu) : %s", exc)

    return synchronisees


def synchroniser_classement() -> int:
    """Effectue son propre appel SerpApi (utilisé isolément — Django Shell, tests). En
    production, tasks.py passe par `synchroniser_donnees_football()` pour mutualiser
    l'appel avec `synchroniser_calendrier()`, voir docstring de tête."""
    if not _api_key_configuree():
        return 0
    resultats = _rechercher_sports_results()
    if not resultats:
        return 0
    return _synchroniser_classement_depuis(resultats)


def synchroniser_calendrier() -> int:
    """Effectue son propre appel SerpApi (utilisé isolément — Django Shell, tests)."""
    if not _api_key_configuree():
        return 0
    resultats = _rechercher_sports_results()
    if not resultats:
        return 0
    return _synchroniser_calendrier_depuis(resultats)


def synchroniser_donnees_football() -> dict:
    """Point d'entrée unique utilisé par tasks.py/Celery Beat — un seul appel SerpApi
    partagé entre classement et calendrier (décision utilisateur 2026-09-24, quota gratuit
    SerpApi resserré à 250 recherches/mois, voir docstring de tête)."""
    if not _api_key_configuree():
        return {"classement": 0, "calendrier": 0}
    resultats = _rechercher_sports_results()
    if not resultats:
        return {"classement": 0, "calendrier": 0}
    return {
        "classement": _synchroniser_classement_depuis(resultats),
        "calendrier": _synchroniser_calendrier_depuis(resultats),
    }

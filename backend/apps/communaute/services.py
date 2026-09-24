"""
Services — app communaute, module Fan-Club (2026-09-24, retour utilisateur : renommer
"Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
Africain, voir docstring de tête de models.py).

Synchronisation périodique de `ClassementLigue`/`RencontreCalendrier`/`StatistiqueJoueur`
depuis **GOAL API** (https://goal-api.com, base REST `https://api.goal-api.com/v1`,
authentification `Authorization: Bearer <clé>`) — décision "hybride" toujours valide :
aucune API gratuite ne fournit de données EN DIRECT (live in-play) pour la Ligue 1
tunisienne, le Live-Ticker (score/chrono/événements pendant un match) reste donc piloté
manuellement par un modérateur (voir `Match`/`MatchEvenement` dans models.py) — ce service
ne les touche jamais.

Remplace SerpApi/Google Sports (décision utilisateur "Komplett auf GOAL API umstellen",
2026-09-24, après plusieurs séries de tests ad-hoc AVEC LA CLÉ SERPAPI RÉELLE de
l'utilisateur ayant montré que le panneau Sports de Google ne fournit, pour un petit
championnat comme la Ligue 1 tunisienne, NI buteurs (Torschützen) NI cartons
(Kartenstatistik) NI répartition domicile/extérieur du classement NI calendrier complet
d'une saison — seulement un tableau complet et une poignée de résultats/prochain match,
voir historique git de ce fichier pour le détail des tests). L'utilisateur a ensuite testé
lui-même GOAL API (clé gratuite, 1000 requêtes/jour, aucune carte bancaire) avec des appels
curl/PowerShell réels et confirmé que TOUTES ces lacunes sont comblées :
  - `GET /leagues/{id}/standings` → tableau complet AVEC répartition domicile/extérieur
    native (`homeLeague*`/`awayLeague*` en plus de `overallLeague*`, voir
    `_synchroniser_classement_depuis`).
  - `GET /teams/{id}/fixtures` (paginé) → calendrier COMPLET de Club Africain, TOUTES
    compétitions confondues (198 rencontres testées : Ligue 1, Coupe, Ligue des Champions
    CAF, matchs amicaux), avec statut explicite (`matchStatus`) — contrairement à SerpApi,
    plus besoin de deux requêtes séparées "résultats récents"/"prochain match" ni de
    deviner si un match est passé/à venir/reporté depuis sa seule date.
  - `GET /teams/{id}/players` (paginé) → effectif complet (73 joueurs testés) avec buts/
    passes décisives/cartons par joueur — alimente les nouvelles listes Torschützen/
    Kartenstatistik (`StatistiqueJoueur`), impossibles sous SerpApi.

MAPPING DES CHAMPS STANDINGS (confirmé le 2026-09-24 sur une réponse brute réelle de
`/leagues/{id}/standings`, via la clé GOAL_API_KEY de l'utilisateur en production
Railway — la première tentative de mapping, faute de confirmation verbatim, avait
synchronisé les colonnes W/D/L/GF/GA/PTS à zéro ; corrigé une fois la réponse brute
obtenue) : `overallLeaguePosition`, `overallLeaguePlayed`,
`overallLeagueW`/`D`/`L`/`GF`/`GA`/`PTS`, mêmes suffixes préfixés `homeLeague*`/
`awayLeague*` pour les répartitions domicile/extérieur, `overallPromotion` (texte de zone
qualification/relégation, ex. "Promotion - CAF Champions League (Qualification)"). Pas de
champ "forme récente" sur cet endpoint (confirmé sur la même réponse brute) :
`forme_recente` reste volontairement vide, voir models.py. `_valeur()` ci-dessous conserve
malgré tout plusieurs orthographes candidates par champ (le nom confirmé en premier,
d'anciennes suppositions en repli) — coût nul, robustesse en cas de variation du schéma
GOAL API sur une autre ligue/saison.

`GOAL_API_KEY` (voir config/settings/base.py, jamais de secret en dur — CLAUDE.md §8) doit
être obtenue par l'utilisateur lui-même (compte gratuit sur https://goal-api.com, 1000
requêtes/jour sans carte bancaire) : sans clé, les fonctions ci-dessous ne font rien (log
d'avertissement) plutôt que d'échouer bruyamment — permet de déployer le module avant que
la clé ne soit configurée. `GOAL_API_LEAGUE_ID`/`GOAL_API_TEAM_ID` (Ligue 1 tunisienne/Club
Africain) sont des identifiants GOAL API confirmés par l'utilisateur — pas des secrets,
préremplis par défaut dans settings/base.py, mais overridables par variable d'env.

GOAL API ne renvoie pas de champ saison fiable et directement exploitable sur tous les
endpoints utilisés ici : la saison est calculée localement (même convention "juillet →
juin" que sous SerpApi), avec un override optionnel `GOAL_API_SAISON`. Chaque
rencontre/joueur est identifié par son `id` GOAL API (CUID), utilisé comme
`evenement_externe_id`/`goal_api_id` — upsert idempotent.

Chaque synchronisation est idempotente (`update_or_create`) et résiliente : une erreur sur
UNE équipe/UNE rencontre/UN joueur (réponse API inattendue, champ manquant) est capturée et
journalisée sans interrompre le reste de la synchronisation — même principe défensif que
les envois email protégés par try/except dans tasks.py (apps.evenements, apps.communaute),
et que l'ancienne implémentation SerpApi de ce fichier.
"""

import logging
from datetime import datetime

import requests
from django.conf import settings
from django.utils import timezone as django_timezone

from .models import ClassementLigue, RencontreCalendrier, StatistiqueJoueur, StatutRencontre

logger = logging.getLogger(__name__)

GOAL_API_URL = "https://api.goal-api.com/v1"
TIMEOUT_SECONDES = 15
LIMITE_PAGINATION = 50
MAX_PAGES = 50  # garde-fou (198 rencontres/73 joueurs testés ≈ 4/2 pages à 50/page)


def _api_key_configuree() -> bool:
    if not settings.GOAL_API_KEY:
        logger.warning(
            "GOAL_API_KEY non configurée — synchronisation Fan-Club ignorée (voir .env.example)."
        )
        return False
    return True


def _get(path: str, params: dict | None = None) -> dict | list | None:
    """Un appel GOAL API authentifié (`Authorization: Bearer`). Retourne le corps JSON
    parsé (dict ou liste selon l'endpoint) ou None en cas d'échec réseau/HTTP/JSON —
    jamais d'exception propagée, voir principe défensif de tête."""
    try:
        reponse = requests.get(
            f"{GOAL_API_URL}{path}",
            headers={"Authorization": f"Bearer {settings.GOAL_API_KEY}"},
            params=params or {},
            timeout=TIMEOUT_SECONDES,
        )
        reponse.raise_for_status()
        return reponse.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Échec requête GOAL API (%s) : %s", path, exc)
        return None


def _extraire_liste(corps) -> tuple[list, dict]:
    """GOAL API enveloppe généralement les listes dans `{"data": [...], "pagination":
    {...}}` — tolère aussi une réponse qui serait directement une liste."""
    if isinstance(corps, dict):
        return (corps.get("data") or []), (corps.get("pagination") or {})
    if isinstance(corps, list):
        return corps, {}
    return [], {}


def _paginer(path: str, params: dict | None = None):
    """Parcourt toutes les pages d'un endpoint GOAL API paginé (`offset`/`limit`/
    `hasMore`, voir docstring de tête), jusqu'à `MAX_PAGES` par sécurité. S'arrête
    silencieusement (générateur vide) si le premier appel échoue — déjà journalisé par
    `_get`."""
    offset = 0
    for _page in range(MAX_PAGES):
        corps = _get(path, {**(params or {}), "limit": LIMITE_PAGINATION, "offset": offset})
        if corps is None:
            return
        liste, pagination = _extraire_liste(corps)
        if not liste:
            return
        yield from liste
        if not pagination.get("hasMore"):
            return
        offset += LIMITE_PAGINATION


def _valeur(source: dict, *cles):
    """Retourne la première valeur non None parmi plusieurs orthographes candidates d'un
    même champ — voir avertissement de tête sur l'incertitude du mapping standings."""
    for cle in cles:
        valeur = source.get(cle)
        if valeur is not None:
            return valeur
    return None


def _entier(valeur, defaut: int = 0) -> int:
    if valeur is None:
        return defaut
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return defaut


def _score(valeur):
    """Comme `_entier`, mais retourne None (score non renseigné) plutôt que 0 — un score
    manquant (match non joué) n'est pas un score nul."""
    if valeur is None:
        return None
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return None


def _nom_equipe(source: dict, cle_imbriquee: str, cle_plate: str) -> str:
    """GOAL API imbrique généralement l'équipe (`{"team": {"name": ...}}` sur standings,
    `{"homeTeam": {"name": ...}}` sur fixtures) — tolère aussi un champ plat au cas où."""
    imbrique = source.get(cle_imbriquee)
    if isinstance(imbrique, dict):
        nom = imbrique.get("name")
        if nom:
            return nom
    plat = source.get(cle_plate)
    if plat:
        return plat
    raise KeyError(cle_imbriquee)


def _saison_actuelle() -> str:
    """GOAL API ne renvoie pas de façon garantie un champ saison directement exploitable
    sur tous les endpoints utilisés ici : calculée localement selon la convention "juillet
    → juin" d'une saison de football, sauf override explicite `GOAL_API_SAISON` (année de
    début, ex. "2025" pour 2025-2026)."""
    if settings.GOAL_API_SAISON:
        try:
            annee = int(settings.GOAL_API_SAISON)
            return f"{annee}-{annee + 1}"
        except ValueError:
            logger.warning("GOAL_API_SAISON invalide, ignorée : %s", settings.GOAL_API_SAISON)

    aujourdhui = django_timezone.localdate()
    annee_debut = aujourdhui.year if aujourdhui.month >= 7 else aujourdhui.year - 1
    return f"{annee_debut}-{annee_debut + 1}"


def _parser_kickoff(fixture: dict):
    """Préfère `kickoffUtc` (horodatage ISO 8601 confirmé sur les réponses réelles
    testées par l'utilisateur — déjà en UTC, sans ambiguïté) ; se rabat sur
    `matchDate`("YYYY-MM-DD")+`matchTime` sinon. Contrairement à SerpApi, GOAL API renvoie
    l'année complète : plus besoin de deviner l'année la plus proche d'aujourd'hui. Retourne
    None si aucun format n'est exploitable."""
    kickoff = fixture.get("kickoffUtc")
    if isinstance(kickoff, str) and kickoff:
        try:
            dt = datetime.fromisoformat(kickoff.replace("Z", "+00:00"))
            if django_timezone.is_naive(dt):
                dt = django_timezone.make_aware(dt)
            return dt
        except ValueError:
            pass

    date_str = fixture.get("matchDate")
    if not date_str:
        return None
    try:
        base = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None

    # Heure de coup d'envoi manquante : midi plutôt que minuit — minuit heure locale
    # (Europe/Berlin) tombe la veille une fois converti en UTC (stockage USE_TZ=True), ce
    # qui décalerait la date affichée d'un jour ; midi reste toujours le même jour
    # calendaire dans les deux fuseaux (même raisonnement que l'ancienne implémentation
    # SerpApi).
    heure, minute = 12, 0
    time_str = fixture.get("matchTime")
    if time_str:
        for format_heure in ("%H:%M:%S", "%H:%M"):
            try:
                parsee = datetime.strptime(time_str.strip(), format_heure)
                heure, minute = parsee.hour, parsee.minute
                break
            except ValueError:
                continue

    naif = base.replace(hour=heure, minute=minute)
    return django_timezone.make_aware(naif)


def _synchroniser_classement_depuis(lignes: list) -> int:
    saison = _saison_actuelle()

    synchronisees = 0
    for ligne in lignes:
        try:
            equipe = _nom_equipe(ligne, "team", "teamName")
            buts_pour = _entier(
                _valeur(ligne, "overallLeagueGF", "overallLeagueGoalsFor", "goalsFor")
            )
            buts_contre = _entier(
                _valeur(ligne, "overallLeagueGA", "overallLeagueGoalsAgainst", "goalsAgainst")
            )

            ClassementLigue.objects.update_or_create(
                saison=saison,
                equipe=equipe,
                defaults={
                    "rang": _entier(_valeur(ligne, "overallLeaguePosition", "position", "rang")),
                    "joues": _entier(_valeur(ligne, "overallLeaguePlayed", "played")),
                    "victoires": _entier(
                        _valeur(ligne, "overallLeagueW", "overallLeagueWon", "won")
                    ),
                    "nuls": _entier(
                        _valeur(ligne, "overallLeagueD", "overallLeagueDraw", "drawn", "draw")
                    ),
                    "defaites": _entier(
                        _valeur(ligne, "overallLeagueL", "overallLeagueLost", "lost")
                    ),
                    "buts_pour": buts_pour,
                    "buts_contre": buts_contre,
                    "difference": buts_pour - buts_contre,
                    "points": _entier(
                        _valeur(ligne, "overallLeaguePTS", "overallLeaguePoints", "points")
                    ),
                    "forme_recente": "",
                    "joues_domicile": _entier(_valeur(ligne, "homeLeaguePlayed")),
                    "victoires_domicile": _entier(_valeur(ligne, "homeLeagueW", "homeLeagueWon")),
                    "nuls_domicile": _entier(
                        _valeur(ligne, "homeLeagueD", "homeLeagueDraw", "homeLeagueDrawn")
                    ),
                    "defaites_domicile": _entier(_valeur(ligne, "homeLeagueL", "homeLeagueLost")),
                    "buts_pour_domicile": _entier(
                        _valeur(ligne, "homeLeagueGF", "homeLeagueGoalsFor")
                    ),
                    "buts_contre_domicile": _entier(
                        _valeur(ligne, "homeLeagueGA", "homeLeagueGoalsAgainst")
                    ),
                    "points_domicile": _entier(_valeur(ligne, "homeLeaguePTS", "homeLeaguePoints")),
                    "joues_exterieur": _entier(_valeur(ligne, "awayLeaguePlayed")),
                    "victoires_exterieur": _entier(_valeur(ligne, "awayLeagueW", "awayLeagueWon")),
                    "nuls_exterieur": _entier(
                        _valeur(ligne, "awayLeagueD", "awayLeagueDraw", "awayLeagueDrawn")
                    ),
                    "defaites_exterieur": _entier(_valeur(ligne, "awayLeagueL", "awayLeagueLost")),
                    "buts_pour_exterieur": _entier(
                        _valeur(ligne, "awayLeagueGF", "awayLeagueGoalsFor")
                    ),
                    "buts_contre_exterieur": _entier(
                        _valeur(ligne, "awayLeagueGA", "awayLeagueGoalsAgainst")
                    ),
                    "points_exterieur": _entier(
                        _valeur(ligne, "awayLeaguePTS", "awayLeaguePoints")
                    ),
                    "zone_texte": ligne.get("overallPromotion") or "",
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Ligne de classement GOAL API ignorée (format inattendu) : %s", exc)

    return synchronisees


def _synchroniser_calendrier_depuis(fixtures) -> int:
    synchronisees = 0
    for fixture in fixtures:
        try:
            event_id = fixture["id"]
            equipe_domicile = _nom_equipe(fixture, "homeTeam", "homeTeamName")
            equipe_exterieur = _nom_equipe(fixture, "awayTeam", "awayTeamName")

            date_heure = _parser_kickoff(fixture)
            if date_heure is None:
                raise ValueError("date GOAL API illisible")

            competition_brute = fixture.get("league")
            if isinstance(competition_brute, dict):
                competition = competition_brute.get("name") or ""
            else:
                competition = fixture.get("competition") or ""

            statut_brut = str(fixture.get("matchStatus") or "").upper()
            statut = (
                statut_brut if statut_brut in StatutRencontre.values else StatutRencontre.PROGRAMMEE
            )

            RencontreCalendrier.objects.update_or_create(
                evenement_externe_id=event_id,
                defaults={
                    "competition": competition,
                    "equipe_domicile": equipe_domicile,
                    "equipe_exterieur": equipe_exterieur,
                    "date_heure": date_heure,
                    "score_domicile": _score(fixture.get("homeTeamScore")),
                    "score_exterieur": _score(fixture.get("awayTeamScore")),
                    "statut": statut,
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Rencontre GOAL API ignorée (format inattendu) : %s", exc)

    return synchronisees


def _synchroniser_statistiques_joueurs_depuis(joueurs) -> int:
    saison = _saison_actuelle()
    equipe_nom = settings.GOAL_API_EQUIPE_NOM

    synchronisees = 0
    for joueur in joueurs:
        try:
            goal_api_id = joueur["id"]
            nom = joueur["name"]
            numero_brut = joueur.get("number")
            numero = None
            if numero_brut not in (None, ""):
                numero = int(numero_brut)

            StatistiqueJoueur.objects.update_or_create(
                goal_api_id=goal_api_id,
                defaults={
                    "saison": saison,
                    "equipe": equipe_nom,
                    "nom": nom,
                    "numero": numero,
                    "poste": joueur.get("type") or "",
                    "matchs_joues": _entier(joueur.get("matchPlayed")),
                    "buts": _entier(joueur.get("goals")),
                    "passes_decisives": _entier(joueur.get("assists")),
                    "cartons_jaunes": _entier(joueur.get("yellowCards")),
                    "cartons_rouges": _entier(joueur.get("redCards")),
                },
            )
            synchronisees += 1
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("Statistique joueur GOAL API ignorée (format inattendu) : %s", exc)

    return synchronisees


def synchroniser_classement() -> int:
    """Tableau complet de la ligue (`GOAL_API_LEAGUE_ID`), avec répartition domicile/
    extérieur native — une seule requête GOAL API, non paginée (une ligue compte au plus
    quelques dizaines d'équipes)."""
    if not _api_key_configuree():
        return 0
    corps = _get(f"/leagues/{settings.GOAL_API_LEAGUE_ID}/standings")
    if corps is None:
        return 0
    lignes, _pagination = _extraire_liste(corps)
    if not lignes:
        logger.warning(
            "Aucune ligne de classement GOAL API pour la ligue %s.", settings.GOAL_API_LEAGUE_ID
        )
        return 0
    return _synchroniser_classement_depuis(lignes)


def synchroniser_calendrier() -> int:
    """Calendrier COMPLET de l'équipe suivie (`GOAL_API_TEAM_ID`), toutes compétitions
    confondues — remplace les deux requêtes SerpApi "résultats récents"/"prochain match"
    par un seul endpoint paginé qui couvre l'intégralité de la saison (voir docstring de
    tête pour pourquoi ce n'était pas possible sous SerpApi)."""
    if not _api_key_configuree():
        return 0
    fixtures = _paginer(f"/teams/{settings.GOAL_API_TEAM_ID}/fixtures")
    return _synchroniser_calendrier_depuis(fixtures)


def synchroniser_statistiques_joueurs() -> int:
    """Effectif complet de l'équipe suivie (`GOAL_API_TEAM_ID`) avec statistiques
    individuelles (buts/passes décisives/cartons) — alimente les listes Torschützen/
    Kartenstatistik de l'onglet Statistiken, indisponibles sous SerpApi."""
    if not _api_key_configuree():
        return 0
    joueurs = _paginer(f"/teams/{settings.GOAL_API_TEAM_ID}/players")
    return _synchroniser_statistiques_joueurs_depuis(joueurs)


def synchroniser_donnees_football() -> dict:
    """Point d'entrée utilisé par tasks.py/Celery Beat — délègue à
    `synchroniser_classement()`/`synchroniser_calendrier()`/
    `synchroniser_statistiques_joueurs()` (voir docstring de tête). Planifié via Celery
    Beat, voir migrations/0007-0010 pour l'historique des fréquences (dernière en date :
    migrations/0010, ajustée pour GOAL API)."""
    return {
        "classement": synchroniser_classement(),
        "calendrier": synchroniser_calendrier(),
        "statistiques_joueurs": synchroniser_statistiques_joueurs(),
    }

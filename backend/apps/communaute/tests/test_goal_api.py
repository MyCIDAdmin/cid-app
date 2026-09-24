"""Tests — services.py (module Fan-Club, 2026-09-24) : synchronisation GOAL API.

Remplace test_serpapi.py (bascule "Komplett auf GOAL API umstellen", voir docstring de
tête services.py). `requests.get` est toujours simulé (`monkeypatch`, même convention que
test_api.py::test_upload_photo_rejette_fichier_trop_volumineux) — aucun appel réseau réel
dans la suite de tests. Le mock dispatche sur la fin de l'URL appelée (`/standings`,
`/fixtures`, `/players`) et simule la pagination `offset`/`limit`/`hasMore` en renvoyant
une page différente à chaque appel successif pour un même endpoint.

Les champs de fixture pour `/fixtures`, `/players` ET `/standings` reprennent EXACTEMENT
les noms confirmés par l'utilisateur sur des réponses réelles (voir docstring de tête
services.py : `matchStatus`, `homeTeamScore`, `matchDate`, `matchTime`, `kickoffUtc`,
`matchPlayed`, `goals`, `assists`, `yellowCards`, `redCards`, et pour `/standings` —
confirmé le 2026-09-24 après un premier déploiement ayant révélé un mapping incorrect,
voir docstring de tête services.py — `overallLeaguePosition`/`Played`/`W`/`D`/`L`/`GF`/
`GA`/`PTS`, mêmes suffixes préfixés `homeLeague*`/`awayLeague*`, `overallPromotion`).

`django_timezone.localdate` est monkeypatché sur les tests touchant à la saison calculée
(GOAL API ne renvoie pas de façon garantie un champ saison directement exploitable) pour un
résultat déterministe.

Chaque test vérifie soit le chemin heureux (parsing classement/calendrier/statistiques
joueurs puis upsert correct, pagination complète), soit la résilience aux erreurs (clé API
absente, erreur HTTP/réseau, ligne/rencontre/joueur au format inattendu) — voir docstring
de tête services.py pour le principe défensif appliqué."""

from datetime import date

import pytest
import requests

from apps.communaute import services
from apps.communaute.models import ClassementLigue, RencontreCalendrier, StatistiqueJoueur

pytestmark = pytest.mark.django_db


class _ReponseFactice:
    def __init__(self, corps, statut=200):
        self._corps = corps
        self.status_code = statut

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self._corps


def _configurer_cle_api(settings):
    settings.GOAL_API_KEY = "cle-de-test"
    settings.GOAL_API_LEAGUE_ID = "ligue-test"
    settings.GOAL_API_TEAM_ID = "equipe-test"
    settings.GOAL_API_EQUIPE_NOM = "Club Africain"
    settings.GOAL_API_SAISON = ""


def _figer_aujourdhui(monkeypatch, annee, mois, jour):
    monkeypatch.setattr(services.django_timezone, "localdate", lambda: date(annee, mois, jour))


def _page(donnees, has_more=False):
    return {"data": donnees, "pagination": {"total": len(donnees), "hasMore": has_more}}


def _dispatch(reponses_par_suffixe=None, appels=None):
    """`reponses_par_suffixe` : dict "/standings" | "/fixtures" | "/players" -> corps
    unique (endpoint non paginé) ou liste de corps (une entrée par appel successif, pour
    simuler la pagination)."""
    reponses_par_suffixe = reponses_par_suffixe or {}
    compteurs = {}

    def _get(url, params=None, headers=None, timeout=None):
        if appels is not None:
            appels.append((url, dict(params or {})))
        for suffixe, corps in reponses_par_suffixe.items():
            if url.endswith(suffixe):
                if isinstance(corps, list):
                    index = compteurs.get(suffixe, 0)
                    compteurs[suffixe] = index + 1
                    if index >= len(corps):
                        return _ReponseFactice(_page([]))
                    return _ReponseFactice(corps[index])
                return _ReponseFactice(corps)
        raise AssertionError(f"Requête GOAL API inattendue dans le test : {url}")

    return _get


_STANDINGS_COMPLET = [
    {
        "team": {"name": "Club Africain"},
        "overallLeaguePosition": "1",
        "overallLeaguePlayed": "3",
        "overallLeagueW": "3",
        "overallLeagueD": "0",
        "overallLeagueL": "0",
        "overallLeagueGF": "9",
        "overallLeagueGA": "2",
        "overallLeaguePTS": "9",
        "homeLeaguePlayed": "2",
        "homeLeagueW": "2",
        "homeLeagueD": "0",
        "homeLeagueL": "0",
        "homeLeagueGF": "6",
        "homeLeagueGA": "1",
        "homeLeaguePTS": "6",
        "awayLeaguePlayed": "1",
        "awayLeagueW": "1",
        "awayLeagueD": "0",
        "awayLeagueL": "0",
        "awayLeagueGF": "3",
        "awayLeagueGA": "1",
        "awayLeaguePTS": "3",
        "overallPromotion": "Promotion - CAF Champions League (Qualification)",
    },
    {
        # Ligne volontairement partielle : aucun champ home/away — doit tomber sur les
        # valeurs par défaut (0) plutôt que lever.
        "team": {"name": "ES Tunis"},
        "overallLeaguePosition": "2",
        "overallLeaguePlayed": "4",
        "overallLeagueW": "3",
        "overallLeagueD": "0",
        "overallLeagueL": "1",
        "overallLeagueGF": "7",
        "overallLeagueGA": "6",
        "overallLeaguePTS": "9",
    },
]

_FIXTURE_JOUEE = {
    "id": "fix-1",
    "matchStatus": "FINISHED",
    "homeTeam": {"name": "Club Africain"},
    "awayTeam": {"name": "Zarzis"},
    "league": {"name": "Tunisian Ligue Professionnelle 1"},
    "matchDate": "2026-09-20",
    "matchTime": "16:00",
    "kickoffUtc": "2026-09-20T15:00:00Z",
    "homeTeamScore": "1",
    "awayTeamScore": "0",
}

_FIXTURE_A_VENIR = {
    "id": "fix-2",
    "matchStatus": "SCHEDULED",
    "homeTeam": {"name": "TP Mazembe"},
    "awayTeam": {"name": "Club Africain"},
    "league": {"name": "CAF Champions League"},
    "matchDate": "2026-10-17",
    "matchTime": None,
    "kickoffUtc": None,
    "homeTeamScore": None,
    "awayTeamScore": None,
}

_FIXTURE_REPORTEE = {
    "id": "fix-3",
    "matchStatus": "POSTPONED",
    "homeTeam": {"name": "Stade Tunisien"},
    "awayTeam": {"name": "Club Africain"},
    "league": {"name": "Tunisian Ligue Professionnelle 1"},
    "matchDate": "2026-09-17",
    "kickoffUtc": "2026-09-17T14:00:00Z",
}

_JOUEUR_BUTEUR = {
    "id": "player-1",
    "name": "Sadok Kadida",
    "number": "9",
    "type": "Forwards",
    "matchPlayed": "7",
    "goals": "4",
    "assists": "1",
    "yellowCards": "0",
    "redCards": "0",
}

_JOUEUR_SANS_NUMERO = {
    "id": "player-2",
    "name": "Taddeus Nkeng",
    "number": None,
    "type": "Midfielders",
    "matchPlayed": "7",
    "goals": "3",
    "assists": "2",
    "yellowCards": "1",
    "redCards": "0",
}


# --- clé API absente ---


def test_synchroniser_classement_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.GOAL_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_classement() == 0
    assert appele == []


def test_synchroniser_calendrier_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.GOAL_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_calendrier() == 0
    assert appele == []


def test_synchroniser_statistiques_joueurs_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.GOAL_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_statistiques_joueurs() == 0
    assert appele == []


def test_synchroniser_donnees_football_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.GOAL_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_donnees_football() == {
        "classement": 0,
        "calendrier": 0,
        "statistiques_joueurs": 0,
    }
    assert appele == []


# --- réponse GOAL API défaillante ---


def test_reponse_http_en_echec_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, headers=None, timeout=None):
        return _ReponseFactice({}, statut=500)

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_classement() == 0


def test_erreur_reseau_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, headers=None, timeout=None):
        raise requests.ConnectionError("timeout simulé")

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_calendrier() == 0


def test_aucune_ligne_standings_ne_fait_rien(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"/standings": _page([])}))
    assert services.synchroniser_classement() == 0


# --- synchroniser_classement (`GET /leagues/{id}/standings`) ---


def test_synchroniser_classement_upsert_avec_repartition_domicile_exterieur(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch({"/standings": _page(_STANDINGS_COMPLET)}, appels=appels),
    )

    total = services.synchroniser_classement()

    assert total == 2
    assert appels == [
        (f"{services.GOAL_API_URL}/leagues/{settings.GOAL_API_LEAGUE_ID}/standings", {})
    ]

    club_africain = ClassementLigue.objects.get(saison="2026-2027", equipe="Club Africain")
    assert club_africain.rang == 1
    assert club_africain.points == 9
    assert club_africain.difference == 7
    assert club_africain.joues_domicile == 2
    assert club_africain.victoires_domicile == 2
    assert club_africain.buts_pour_domicile == 6
    assert club_africain.joues_exterieur == 1
    assert club_africain.buts_pour_exterieur == 3
    assert club_africain.zone_texte == "Promotion - CAF Champions League (Qualification)"
    # GOAL API standings n'expose pas (à confirmer) de champ "forme récente" — laissé vide
    # plutôt qu'inventé, voir docstring de tête services.py.
    assert club_africain.forme_recente == ""

    es_tunis = ClassementLigue.objects.get(equipe="ES Tunis")
    assert es_tunis.joues_domicile == 0
    assert es_tunis.zone_texte == ""


def test_synchroniser_classement_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(requests, "get", _dispatch({"/standings": _page(_STANDINGS_COMPLET)}))
    services.synchroniser_classement()
    services.synchroniser_classement()

    assert ClassementLigue.objects.filter(saison="2026-2027", equipe="Club Africain").count() == 1


def test_synchroniser_classement_ignore_une_ligne_sans_equipe(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch({"/standings": _page([{"overallLeaguePosition": "1"}])}),
    )

    total = services.synchroniser_classement()

    assert total == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_utilise_la_saison_explicite_si_definie(settings, monkeypatch):
    _configurer_cle_api(settings)
    settings.GOAL_API_SAISON = "2024"
    monkeypatch.setattr(requests, "get", _dispatch({"/standings": _page(_STANDINGS_COMPLET)}))

    services.synchroniser_classement()

    assert ClassementLigue.objects.get(equipe="Club Africain").saison == "2024-2025"


@pytest.mark.parametrize(
    ("annee", "mois", "jour", "saison_attendue"),
    [
        (2026, 9, 24, "2026-2027"),  # après juillet → saison en cours démarrée cette année
        (2027, 3, 1, "2026-2027"),  # avant juillet → toujours la saison démarrée l'an dernier
        (2026, 6, 30, "2025-2026"),  # dernier jour avant la bascule de juillet
        (2026, 7, 1, "2026-2027"),  # bascule
    ],
)
def test_synchroniser_classement_saison_calculee_convention_juillet(
    settings, monkeypatch, annee, mois, jour, saison_attendue
):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, annee, mois, jour)
    monkeypatch.setattr(requests, "get", _dispatch({"/standings": _page(_STANDINGS_COMPLET)}))

    services.synchroniser_classement()

    assert ClassementLigue.objects.get(equipe="Club Africain").saison == saison_attendue


# --- synchroniser_calendrier (`GET /teams/{id}/fixtures`, paginé) ---


def test_synchroniser_calendrier_parcourt_toutes_les_pages(settings, monkeypatch):
    _configurer_cle_api(settings)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "/fixtures": [
                    _page([_FIXTURE_JOUEE], has_more=True),
                    _page([_FIXTURE_A_VENIR, _FIXTURE_REPORTEE], has_more=False),
                ]
            },
            appels=appels,
        ),
    )

    total = services.synchroniser_calendrier()

    assert total == 3
    assert RencontreCalendrier.objects.count() == 3
    # Deux appels : offset=0 (hasMore=True) puis offset=50 (hasMore=False, arrêt).
    assert [params["offset"] for _url, params in appels] == [0, 50]

    joue = RencontreCalendrier.objects.get(evenement_externe_id="fix-1")
    assert joue.equipe_domicile == "Club Africain"
    assert joue.equipe_exterieur == "Zarzis"
    assert joue.competition == "Tunisian Ligue Professionnelle 1"
    assert joue.score_domicile == 1
    assert joue.score_exterieur == 0
    assert joue.statut == "FINISHED"
    assert not joue.est_a_venir
    # kickoffUtc ("2026-09-20T15:00:00Z") préféré à matchDate+matchTime.
    assert joue.date_heure.hour == 15

    a_venir = RencontreCalendrier.objects.get(evenement_externe_id="fix-2")
    assert a_venir.statut == "SCHEDULED"
    assert a_venir.score_domicile is None
    assert a_venir.est_a_venir
    # Pas de kickoffUtc/matchTime : repli sur matchDate + midi heure locale (voir
    # _parser_kickoff) — pas d'assertion sur l'heure UTC stockée, qui dépend du décalage
    # DST Europe/Berlin au moment considéré (même convention que l'ancien test_serpapi.py).
    assert a_venir.date_heure.year == 2026
    assert a_venir.date_heure.month == 10
    assert a_venir.date_heure.day == 17

    reportee = RencontreCalendrier.objects.get(evenement_externe_id="fix-3")
    assert reportee.statut == "POSTPONED"
    assert not reportee.est_a_venir


def test_synchroniser_calendrier_statut_inconnu_replie_sur_programmee(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixture = dict(_FIXTURE_A_VENIR, matchStatus="ON_HOLD_INCONNU")
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([fixture])]}))

    services.synchroniser_calendrier()

    assert RencontreCalendrier.objects.get(evenement_externe_id="fix-2").statut == "SCHEDULED"


def test_synchroniser_calendrier_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([_FIXTURE_JOUEE])]}))
    services.synchroniser_calendrier()
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([_FIXTURE_JOUEE])]}))
    services.synchroniser_calendrier()

    assert RencontreCalendrier.objects.count() == 1


def test_synchroniser_calendrier_ignore_une_rencontre_sans_date_exploitable(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixture_sans_date = dict(_FIXTURE_A_VENIR, matchDate=None, kickoffUtc=None)
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([fixture_sans_date])]}))

    assert services.synchroniser_calendrier() == 0
    assert RencontreCalendrier.objects.count() == 0


def test_synchroniser_calendrier_ignore_une_rencontre_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixture_cassee = {"id": "fix-cassee", "matchDate": "2026-10-01"}  # ni homeTeam ni awayTeam
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([fixture_cassee])]}))

    assert services.synchroniser_calendrier() == 0
    assert RencontreCalendrier.objects.count() == 0


def test_synchroniser_calendrier_ignore_un_score_illisible(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixture = dict(_FIXTURE_JOUEE, id="fix-score-invalide", homeTeamScore="non-numérique")
    monkeypatch.setattr(requests, "get", _dispatch({"/fixtures": [_page([fixture])]}))

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="fix-score-invalide")
    assert rencontre.score_domicile is None
    assert rencontre.score_exterieur == 0


# --- synchroniser_statistiques_joueurs (`GET /teams/{id}/players`, paginé) ---


def test_synchroniser_statistiques_joueurs_parcourt_toutes_les_pages(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "/players": [
                    _page([_JOUEUR_BUTEUR], has_more=True),
                    _page([_JOUEUR_SANS_NUMERO], has_more=False),
                ]
            },
            appels=appels,
        ),
    )

    total = services.synchroniser_statistiques_joueurs()

    assert total == 2
    assert [params["offset"] for _url, params in appels] == [0, 50]

    buteur = StatistiqueJoueur.objects.get(goal_api_id="player-1")
    assert buteur.nom == "Sadok Kadida"
    assert buteur.numero == 9
    assert buteur.poste == "Forwards"
    assert buteur.matchs_joues == 7
    assert buteur.buts == 4
    assert buteur.passes_decisives == 1
    assert buteur.equipe == "Club Africain"
    assert buteur.saison == "2026-2027"

    milieu = StatistiqueJoueur.objects.get(goal_api_id="player-2")
    assert milieu.numero is None
    assert milieu.cartons_jaunes == 1


def test_synchroniser_statistiques_joueurs_appele_deux_fois_met_a_jour_sans_dupliquer(
    settings, monkeypatch
):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"/players": [_page([_JOUEUR_BUTEUR])]}))
    services.synchroniser_statistiques_joueurs()
    monkeypatch.setattr(requests, "get", _dispatch({"/players": [_page([_JOUEUR_BUTEUR])]}))
    services.synchroniser_statistiques_joueurs()

    assert StatistiqueJoueur.objects.count() == 1


def test_synchroniser_statistiques_joueurs_ignore_un_joueur_au_format_inattendu(
    settings, monkeypatch
):
    _configurer_cle_api(settings)
    joueur_casse = {"id": "player-casse"}  # pas de "name"
    monkeypatch.setattr(requests, "get", _dispatch({"/players": [_page([joueur_casse])]}))

    total = services.synchroniser_statistiques_joueurs()

    assert total == 0
    assert StatistiqueJoueur.objects.count() == 0


# --- synchroniser_donnees_football (point d'entrée Celery) ---


def test_synchroniser_donnees_football_combine_les_trois_synchronisations(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "/standings": _page(_STANDINGS_COMPLET),
                "/fixtures": [_page([_FIXTURE_JOUEE, _FIXTURE_A_VENIR])],
                "/players": [_page([_JOUEUR_BUTEUR, _JOUEUR_SANS_NUMERO])],
            }
        ),
    )

    resultat = services.synchroniser_donnees_football()

    assert resultat == {"classement": 2, "calendrier": 2, "statistiques_joueurs": 2}
    assert ClassementLigue.objects.count() == 2
    assert RencontreCalendrier.objects.count() == 2
    assert StatistiqueJoueur.objects.count() == 2

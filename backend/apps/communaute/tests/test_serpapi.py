"""Tests — services.py (module Fan-Club, 2026-09-24) : synchronisation SerpApi/Google
Sports.

`requests.get` est toujours simulé (`monkeypatch`, même convention que
test_api.py::test_upload_photo_rejette_fichier_trop_volumineux) — aucun appel réseau réel
dans la suite de tests. Le mock dispatche sur le contenu de `params["q"]` ("standings" /
"results" / "schedule") pour refléter que `synchroniser_calendrier()` fait DEUX requêtes
distinctes (résultats récents + prochain match, voir docstring de tête services.py).
`django_timezone.localdate` est monkeypatché sur les tests touchant à la saison calculée
ou au parsing de date SerpApi (qui ne renvoie jamais l'année) pour un résultat
déterministe.

Chaque test vérifie soit le chemin heureux (parsing classement/calendrier puis upsert
correct), soit la résilience aux erreurs (clé API absente, aucun sports_results, erreur
SerpApi explicite, réponse HTTP en échec, ligne/jeu au format inattendu, une des deux
requêtes calendrier en échec sans bloquer l'autre) — voir docstring de tête services.py
pour le principe défensif appliqué.

Remplace une première version de ce fichier basée sur une unique requête SerpApi
mutualisée — revue le jour même après les tests ad-hoc ayant montré qu'une requête sur le
nom de l'équipe ne renvoie qu'un tableau tronqué à 5 lignes, jamais le tableau complet."""

from datetime import date

import pytest
import requests

from apps.communaute import services
from apps.communaute.models import ClassementLigue, RencontreCalendrier

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
    settings.SERPAPI_KEY = "cle-de-test"
    settings.SERPAPI_EQUIPE = "Club Africain"
    settings.SERPAPI_LIGUE = "Tunisian Ligue Professionnelle 1"
    settings.SERPAPI_SAISON = ""


def _figer_aujourdhui(monkeypatch, annee, mois, jour):
    monkeypatch.setattr(services.django_timezone, "localdate", lambda: date(annee, mois, jour))


_STANDINGS_COMPLET = [
    {
        "team": {"name": "Club Africain"},
        "pos": "1",
        "mp": "3",
        "w": "3",
        "d": "0",
        "l": "0",
        "gf": "3",
        "ga": "0",
        "gd": "3",
        "pts": "9",
        "last_5": ["win", "win", "win", "not played", "not played"],
    },
    {
        "team": {"name": "ES Tunis"},
        "pos": "2",
        "mp": "4",
        "w": "3",
        "d": "0",
        "l": "1",
        "gf": "7",
        "ga": "6",
        "gd": "1",
        "pts": "9",
        "last_5": ["win", "loss", "win", "win", "not played"],
    },
    {
        "team": {"name": "CS Sfaxien"},
        "pos": "3",
        "mp": "4",
        "w": "2",
        "d": "2",
        "l": "0",
        "gf": "6",
        "ga": "3",
        "gd": "3",
        "pts": "8",
        "last_5": ["tie", "win", "tie", "win", "not played"],
    },
]

_RESULTAT_JOUE = {
    "tournament": "Tunisian Ligue Professionnelle 1",
    "status": "FT",
    "date": "Sun, Sep 20",
    "teams": [
        {"name": "Club Africain", "score": "1", "kgmid": "/m/0c7yh9"},
        {"name": "Zarzis", "score": "0", "kgmid": "/m/0cckgc"},
    ],
    "kgmid": "/g/11nvwpbnrd",
}

_PROCHAIN_MATCH = {
    "tournament": "CAF Champions League",
    "stage": "Second qualifying round · Leg 1 of 2",
    "date": "Oct 17",
    "time": "11:00 AM",
    "teams": [{"name": "TP Mazembe"}, {"name": "Club Africain"}],
    "kgmid": "/g/11zypstbsb",
}


def _sports_results(standings=None, games=None):
    return {
        "sports_results": {
            "title": "Tunisian Ligue Professionnelle 1",
            "league": {"standings": standings} if standings is not None else {},
            "games": games if games is not None else [],
        }
    }


def _dispatch(corps_standings=None, corps_resultats=None, corps_schedule=None, appels=None):
    def _get(url, params=None, timeout=None):
        if appels is not None:
            appels.append(params["q"])
        q = params["q"]
        if "standings" in q:
            return _ReponseFactice(corps_standings if corps_standings is not None else {})
        if "results" in q:
            return _ReponseFactice(corps_resultats if corps_resultats is not None else {})
        if "schedule" in q:
            return _ReponseFactice(corps_schedule if corps_schedule is not None else {})
        raise AssertionError(f"Requête SerpApi inattendue dans le test : {q}")

    return _get


# --- clé API absente ---


def test_synchroniser_classement_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.SERPAPI_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_classement() == 0
    assert appele == []


def test_synchroniser_calendrier_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.SERPAPI_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_calendrier() == 0
    assert appele == []


def test_synchroniser_donnees_football_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.SERPAPI_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_donnees_football() == {"classement": 0, "calendrier": 0}
    assert appele == []


# --- réponse SerpApi défaillante ---


def test_aucun_sports_results_ne_fait_rien(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch())
    assert services.synchroniser_classement() == 0
    assert services.synchroniser_calendrier() == 0


def test_erreur_serpapi_explicite_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        return _ReponseFactice({"error": "Invalid API key."})

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_classement() == 0


def test_reponse_http_en_echec_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        return _ReponseFactice({}, statut=500)

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_classement() == 0


def test_erreur_reseau_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        raise requests.ConnectionError("timeout simulé")

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_calendrier() == 0


# --- synchroniser_classement (requête "<ligue> standings") ---


def test_synchroniser_classement_upsert_le_tableau_complet_et_traduit_la_forme(
    settings, monkeypatch
):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_standings=_sports_results(standings=_STANDINGS_COMPLET), appels=appels),
    )

    total = services.synchroniser_classement()

    assert total == 3
    assert appels == [f"{settings.SERPAPI_LIGUE} standings"]
    assert ClassementLigue.objects.filter(saison="2026-2027").count() == 3
    club_africain = ClassementLigue.objects.get(equipe="Club Africain")
    assert club_africain.rang == 1
    assert club_africain.points == 9
    # "not played" (placeholders de matchs futurs dans last_5) silencieusement ignorés.
    assert club_africain.forme_recente == "VVV"
    es_tunis = ClassementLigue.objects.get(equipe="ES Tunis")
    assert es_tunis.forme_recente == "VDVV"


def test_synchroniser_classement_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_standings=_sports_results(standings=_STANDINGS_COMPLET)),
    )
    services.synchroniser_classement()
    services.synchroniser_classement()

    assert ClassementLigue.objects.filter(saison="2026-2027", equipe="Club Africain").count() == 1


def test_synchroniser_classement_ignore_une_ligne_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_standings=_sports_results(standings=[{"team": {}}])),
    )

    total = services.synchroniser_classement()

    assert total == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_utilise_la_saison_explicite_si_definie(settings, monkeypatch):
    _configurer_cle_api(settings)
    settings.SERPAPI_SAISON = "2024"
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_standings=_sports_results(standings=_STANDINGS_COMPLET)),
    )

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
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_standings=_sports_results(standings=_STANDINGS_COMPLET)),
    )

    services.synchroniser_classement()

    assert ClassementLigue.objects.get(equipe="Club Africain").saison == saison_attendue


# --- synchroniser_calendrier (requêtes "<ligue> results" + "<équipe> schedule") ---


def test_synchroniser_calendrier_combine_resultats_et_prochain_match(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            corps_resultats=_sports_results(games=[_RESULTAT_JOUE]),
            corps_schedule=_sports_results(games=[_PROCHAIN_MATCH]),
            appels=appels,
        ),
    )

    total = services.synchroniser_calendrier()

    assert total == 2
    assert appels == [
        f"{settings.SERPAPI_LIGUE} results",
        f"{settings.SERPAPI_EQUIPE} schedule",
    ]

    resultat = RencontreCalendrier.objects.get(evenement_externe_id="/g/11nvwpbnrd")
    assert resultat.competition == "Tunisian Ligue Professionnelle 1"
    assert resultat.equipe_domicile == "Club Africain"
    assert resultat.equipe_exterieur == "Zarzis"
    assert resultat.score_domicile == 1
    assert resultat.score_exterieur == 0

    prochain = RencontreCalendrier.objects.get(evenement_externe_id="/g/11zypstbsb")
    assert prochain.competition == "CAF Champions League"
    assert prochain.equipe_domicile == "TP Mazembe"
    assert prochain.equipe_exterieur == "Club Africain"
    assert prochain.score_domicile is None
    assert prochain.score_exterieur is None
    assert prochain.date_heure.year == 2026
    assert prochain.date_heure.month == 10
    assert prochain.date_heure.day == 17


def test_synchroniser_calendrier_une_requete_en_echec_nempeche_pas_lautre(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)

    def _get(url, params=None, timeout=None):
        if "results" in params["q"]:
            raise requests.ConnectionError("timeout simulé")
        return _ReponseFactice(_sports_results(games=[_PROCHAIN_MATCH]))

    monkeypatch.setattr(requests, "get", _get)

    total = services.synchroniser_calendrier()

    assert total == 1
    assert RencontreCalendrier.objects.count() == 1
    assert RencontreCalendrier.objects.get().evenement_externe_id == "/g/11zypstbsb"


def test_synchroniser_calendrier_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            corps_resultats=_sports_results(games=[_RESULTAT_JOUE]),
            corps_schedule=_sports_results(games=[_PROCHAIN_MATCH]),
        ),
    )
    services.synchroniser_calendrier()
    services.synchroniser_calendrier()

    assert RencontreCalendrier.objects.count() == 2


def test_synchroniser_calendrier_ignore_un_jeu_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    jeu_casse = {"tournament": "Ligue 1", "date": "Oct 17", "teams": [{"name": "Seul"}]}
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_schedule=_sports_results(games=[jeu_casse])),
    )

    total = services.synchroniser_calendrier()

    assert total == 0
    assert RencontreCalendrier.objects.count() == 0


def test_synchroniser_calendrier_ignore_un_jeu_sans_date_exploitable(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    jeu_sans_date = dict(_PROCHAIN_MATCH, date="", kgmid="/g/sans-date")
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_schedule=_sports_results(games=[jeu_sans_date])),
    )

    assert services.synchroniser_calendrier() == 0


def test_synchroniser_calendrier_accepte_les_dates_prefixees_du_jour_de_semaine(
    settings, monkeypatch
):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_resultats=_sports_results(games=[_RESULTAT_JOUE])),
    )

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="/g/11nvwpbnrd")
    assert rencontre.date_heure.year == 2026
    assert rencontre.date_heure.month == 9
    assert rencontre.date_heure.day == 20


def test_synchroniser_calendrier_bascule_sur_lannee_suivante_si_deja_passee(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 12, 20)
    jeu_nouvel_an = dict(_PROCHAIN_MATCH, date="Jan 3", time="6:00 PM", kgmid="/g/nouvel-an")
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_schedule=_sports_results(games=[jeu_nouvel_an])),
    )

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="/g/nouvel-an")
    assert rencontre.date_heure.year == 2027
    assert rencontre.date_heure.month == 1
    assert rencontre.date_heure.day == 3


def test_synchroniser_calendrier_ignore_un_score_illisible(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    jeu_score_invalide = {
        "tournament": "Tunisian Ligue Professionnelle 1",
        "status": "FT",
        "date": "Sun, Sep 20",
        "teams": [
            {"name": "Club Africain", "score": "non-numérique"},
            {"name": "Zarzis", "score": "0"},
        ],
        "kgmid": "/g/score-invalide",
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(corps_resultats=_sports_results(games=[jeu_score_invalide])),
    )

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="/g/score-invalide")
    assert rencontre.score_domicile is None
    assert rencontre.score_exterieur == 0


# --- synchroniser_donnees_football (point d'entrée Celery, 3 requêtes SerpApi) ---


def test_synchroniser_donnees_football_fait_trois_appels_http(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = []
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            corps_standings=_sports_results(standings=_STANDINGS_COMPLET),
            corps_resultats=_sports_results(games=[_RESULTAT_JOUE]),
            corps_schedule=_sports_results(games=[_PROCHAIN_MATCH]),
            appels=appels,
        ),
    )

    resultat = services.synchroniser_donnees_football()

    assert len(appels) == 3
    assert resultat == {"classement": 3, "calendrier": 2}
    assert ClassementLigue.objects.count() == 3
    assert RencontreCalendrier.objects.count() == 2

"""Tests — services.py (module Fan-Club, 2026-09-24) : synchronisation SerpApi/Google
Sports.

`requests.get` est toujours simulé (`monkeypatch`, même convention que
test_api.py::test_upload_photo_rejette_fichier_trop_volumineux) — aucun appel réseau réel
dans la suite de tests. `django_timezone.localdate` est également monkeypatché sur les
tests touchant à la saison calculée ou au parsing de date SerpApi (qui ne renvoie jamais
l'année, voir services.py::_parser_date_heure) pour un résultat déterministe.

Chaque test vérifie soit le chemin heureux (parsing classement/calendrier puis upsert
correct), soit la résilience aux erreurs (clé API absente, aucun sports_results, erreur
SerpApi explicite, réponse HTTP en échec, ligne/jeu au format inattendu) — voir docstring
de tête services.py pour le principe défensif appliqué.

Remplace test_api_football.py (bascule de fournisseur du 2026-09-24, voir services.py)."""

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
    settings.SERPAPI_SAISON = ""


def _figer_aujourdhui(monkeypatch, annee, mois, jour):
    monkeypatch.setattr(services.django_timezone, "localdate", lambda: date(annee, mois, jour))


_STANDING_CLUB_AFRICAIN = {
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
}

_JEU_A_VENIR = {
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
            "title": "Club Africain",
            "rankings": "1st in Tunisian Ligue Professionnelle 1",
            "league": {
                "standings": standings if standings is not None else [_STANDING_CLUB_AFRICAIN]
            },
            "games": games if games is not None else [_JEU_A_VENIR],
        }
    }


def _get_factice(corps, statut=200):
    def _get(url, params=None, timeout=None):
        return _ReponseFactice(corps, statut=statut)

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
    monkeypatch.setattr(requests, "get", _get_factice({}))
    assert services.synchroniser_classement() == 0
    assert services.synchroniser_calendrier() == 0


def test_erreur_serpapi_explicite_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _get_factice({"error": "Invalid API key."}))
    assert services.synchroniser_classement() == 0


def test_reponse_http_en_echec_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _get_factice({}, statut=500))
    assert services.synchroniser_classement() == 0


def test_erreur_reseau_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        raise requests.ConnectionError("timeout simulé")

    monkeypatch.setattr(requests, "get", _get)
    assert services.synchroniser_calendrier() == 0


# --- synchroniser_classement ---


def test_synchroniser_classement_upsert_et_traduit_la_forme(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results()))

    total = services.synchroniser_classement()

    assert total == 1
    ligne = ClassementLigue.objects.get(saison="2026-2027", equipe="Club Africain")
    assert ligne.rang == 1
    assert ligne.points == 9
    # "not played" (placeholders de matchs futurs dans last_5) silencieusement ignorés.
    assert ligne.forme_recente == "VVV"


def test_synchroniser_classement_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    standing = dict(_STANDING_CLUB_AFRICAIN, pts="9")
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(standings=[standing])))
    services.synchroniser_classement()

    standing_maj = dict(_STANDING_CLUB_AFRICAIN, pts="12")
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(standings=[standing_maj])))
    services.synchroniser_classement()

    assert ClassementLigue.objects.filter(saison="2026-2027", equipe="Club Africain").count() == 1
    assert ClassementLigue.objects.get(equipe="Club Africain").points == 12


def test_synchroniser_classement_ignore_une_ligne_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(standings=[{"team": {}}])))

    total = services.synchroniser_classement()

    assert total == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_utilise_la_saison_explicite_si_definie(settings, monkeypatch):
    _configurer_cle_api(settings)
    settings.SERPAPI_SAISON = "2024"
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results()))

    total = services.synchroniser_classement()

    assert total == 1
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
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results()))

    services.synchroniser_classement()

    assert ClassementLigue.objects.get(equipe="Club Africain").saison == saison_attendue


# --- synchroniser_calendrier ---


def test_synchroniser_calendrier_upsert_les_rencontres(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results()))

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="/g/11zypstbsb")
    assert rencontre.competition == "CAF Champions League"
    # Convention observée : teams[0] = domicile, teams[1] = extérieur.
    assert rencontre.equipe_domicile == "TP Mazembe"
    assert rencontre.equipe_exterieur == "Club Africain"
    assert rencontre.score_domicile is None
    assert rencontre.date_heure.year == 2026
    assert rencontre.date_heure.month == 10
    assert rencontre.date_heure.day == 17


def test_synchroniser_calendrier_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results()))
    services.synchroniser_calendrier()
    services.synchroniser_calendrier()

    assert RencontreCalendrier.objects.filter(evenement_externe_id="/g/11zypstbsb").count() == 1


def test_synchroniser_calendrier_ignore_un_jeu_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    jeu_casse = {"tournament": "Ligue 1", "date": "Oct 17", "teams": [{"name": "Seul"}]}
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(games=[jeu_casse])))

    total = services.synchroniser_calendrier()

    assert total == 0
    assert RencontreCalendrier.objects.count() == 0


def test_synchroniser_calendrier_ignore_un_jeu_sans_date_exploitable(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    jeu_sans_date = dict(_JEU_A_VENIR, date="", kgmid="/g/sans-date")
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(games=[jeu_sans_date])))

    assert services.synchroniser_calendrier() == 0


def test_synchroniser_calendrier_bascule_sur_lannee_suivante_si_deja_passee(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 12, 20)
    jeu_nouvel_an = dict(_JEU_A_VENIR, date="Jan 3", time="6:00 PM", kgmid="/g/nouvel-an")
    monkeypatch.setattr(requests, "get", _get_factice(_sports_results(games=[jeu_nouvel_an])))

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="/g/nouvel-an")
    assert rencontre.date_heure.year == 2027
    assert rencontre.date_heure.month == 1
    assert rencontre.date_heure.day == 3


# --- synchroniser_donnees_football (point d'entrée Celery, un seul appel mutualisé) ---


def test_synchroniser_donnees_football_ne_fait_quun_seul_appel_http(settings, monkeypatch):
    _configurer_cle_api(settings)
    _figer_aujourdhui(monkeypatch, 2026, 9, 24)
    appels = {"n": 0}

    def _get(url, params=None, timeout=None):
        appels["n"] += 1
        return _ReponseFactice(_sports_results())

    monkeypatch.setattr(requests, "get", _get)

    resultat = services.synchroniser_donnees_football()

    assert appels["n"] == 1
    assert resultat == {"classement": 1, "calendrier": 1}
    assert ClassementLigue.objects.count() == 1
    assert RencontreCalendrier.objects.count() == 1

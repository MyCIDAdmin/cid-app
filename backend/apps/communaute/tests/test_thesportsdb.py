"""Tests — services.py (module Fan-Club, 2026-09-24) : synchronisation TheSportsDB.

`requests.get` est toujours simulé (`monkeypatch`, même convention que
test_api.py::test_upload_photo_rejette_fichier_trop_volumineux) — aucun appel réseau réel
dans la suite de tests. Chaque test vérifie soit le chemin heureux (upsert correct), soit
la résilience aux erreurs (clé API absente, réponse HTTP en échec, ligne de format
inattendu) — voir docstring de tête services.py pour le principe défensif appliqué."""

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
    settings.THESPORTSDB_API_KEY = "cle-de-test"
    settings.THESPORTSDB_LEAGUE_ID = "4394"
    settings.THESPORTSDB_SAISON = "2025-2026"
    settings.THESPORTSDB_EQUIPE = "Club Africain"


# --- synchroniser_classement ---


def test_synchroniser_classement_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.THESPORTSDB_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_classement() == 0
    assert appele == []


def test_synchroniser_classement_upsert_les_lignes(settings, monkeypatch):
    _configurer_cle_api(settings)
    corps = {
        "table": [
            {
                "strTeam": "Club Africain",
                "intRank": "1",
                "intPlayed": "10",
                "intWin": "7",
                "intDraw": "2",
                "intLoss": "1",
                "intGoalsFor": "20",
                "intGoalsAgainst": "8",
                "intGoalDifference": "12",
                "intPoints": "23",
                "strForm": "VVNVV",
            }
        ]
    }
    monkeypatch.setattr(requests, "get", lambda *a, **k: _ReponseFactice(corps))

    total = services.synchroniser_classement()

    assert total == 1
    ligne = ClassementLigue.objects.get(saison="2025-2026", equipe="Club Africain")
    assert ligne.rang == 1
    assert ligne.points == 23
    assert ligne.forme_recente == "VVNVV"


def test_synchroniser_classement_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    corps = {
        "table": [
            {"strTeam": "Club Africain", "intRank": "2", "intPoints": "20"},
        ]
    }
    monkeypatch.setattr(requests, "get", lambda *a, **k: _ReponseFactice(corps))
    services.synchroniser_classement()

    corps["table"][0]["intRank"] = "1"
    corps["table"][0]["intPoints"] = "23"
    services.synchroniser_classement()

    assert ClassementLigue.objects.filter(saison="2025-2026", equipe="Club Africain").count() == 1
    ligne = ClassementLigue.objects.get(saison="2025-2026", equipe="Club Africain")
    assert ligne.rang == 1
    assert ligne.points == 23


def test_synchroniser_classement_ignore_une_ligne_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    corps = {"table": [{"strTeam": "Sans rang valide", "intRank": "pas-un-nombre"}]}
    monkeypatch.setattr(requests, "get", lambda *a, **k: _ReponseFactice(corps))

    total = services.synchroniser_classement()

    assert total == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_reponse_http_en_echec_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", lambda *a, **k: _ReponseFactice({}, statut=500))

    assert services.synchroniser_classement() == 0


# --- synchroniser_calendrier ---


def test_synchroniser_calendrier_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.THESPORTSDB_API_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_calendrier() == 0
    assert appele == []


def test_synchroniser_calendrier_equipe_introuvable_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", lambda *a, **k: _ReponseFactice({"teams": None}))

    assert services.synchroniser_calendrier() == 0


def test_synchroniser_calendrier_upsert_les_rencontres(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        if "searchteams" in url:
            return _ReponseFactice({"teams": [{"idTeam": "133673"}]})
        if "eventsnext" in url:
            return _ReponseFactice(
                {
                    "events": [
                        {
                            "idEvent": "evt-1",
                            "strLeague": "Ligue 1 Tunisie",
                            "strHomeTeam": "Club Africain",
                            "strAwayTeam": "EST",
                            "dateEvent": "2026-10-05",
                            "strTime": "18:00:00",
                            "intHomeScore": None,
                            "intAwayScore": None,
                        }
                    ]
                }
            )
        return _ReponseFactice({"results": []})

    monkeypatch.setattr(requests, "get", _get)

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(thesportsdb_event_id="evt-1")
    assert rencontre.equipe_domicile == "Club Africain"
    assert rencontre.equipe_exterieur == "EST"
    assert rencontre.score_domicile is None


def test_synchroniser_calendrier_une_requete_en_echec_nempeche_pas_lautre(settings, monkeypatch):
    _configurer_cle_api(settings)

    def _get(url, params=None, timeout=None):
        if "searchteams" in url:
            return _ReponseFactice({"teams": [{"idTeam": "133673"}]})
        if "eventsnext" in url:
            raise requests.ConnectionError("timeout simulé")
        return _ReponseFactice(
            {
                "results": [
                    {
                        "idEvent": "evt-passe",
                        "strLeague": "Ligue 1 Tunisie",
                        "strHomeTeam": "Club Africain",
                        "strAwayTeam": "CS Sfaxien",
                        "dateEvent": "2026-09-01",
                        "strTime": "20:00:00",
                        "intHomeScore": "2",
                        "intAwayScore": "1",
                    }
                ]
            }
        )

    monkeypatch.setattr(requests, "get", _get)

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(thesportsdb_event_id="evt-passe")
    assert rencontre.score_domicile == 2
    assert rencontre.score_exterieur == 1

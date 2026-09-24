"""Tests — services.py (module Fan-Club, 2026-09-24) : synchronisation API-Football.

`requests.get` est toujours simulé (`monkeypatch`, même convention que
test_api.py::test_upload_photo_rejette_fichier_trop_volumineux) — aucun appel réseau réel
dans la suite de tests. Chaque test vérifie soit le chemin heureux (résolution équipe/ligue
puis upsert correct), soit la résilience aux erreurs (clé API absente, équipe/ligue
introuvable, réponse HTTP en échec, ligne de format inattendu) — voir docstring de tête
services.py pour le principe défensif appliqué.

Remplace test_thesportsdb.py (bascule de fournisseur du 2026-09-24, voir services.py)."""

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
    settings.API_FOOTBALL_KEY = "cle-de-test"
    settings.API_FOOTBALL_EQUIPE = "Club Africain"
    settings.API_FOOTBALL_PAYS = "Tunisia"
    settings.API_FOOTBALL_SAISON = ""


_EQUIPE_TROUVEE = {"response": [{"team": {"id": 1024, "name": "Club Africain"}}]}

_LIGUES_TROUVEES = {
    "response": [
        {
            "league": {"id": 202, "name": "Ligue 1", "type": "League"},
            "country": {"name": "Tunisia"},
            "seasons": [{"year": 2024, "current": False}, {"year": 2025, "current": True}],
        },
        {
            "league": {"id": 909, "name": "Coupe de Tunisie", "type": "Cup"},
            "country": {"name": "Tunisia"},
            "seasons": [{"year": 2025, "current": True}],
        },
        {
            "league": {"id": 12, "name": "CAF Champions League", "type": "Cup"},
            "country": {"name": "World"},
            "seasons": [{"year": 2025, "current": True}],
        },
    ]
}


def _dispatch(reponses_par_chemin):
    def _get(url, headers=None, params=None, timeout=None):
        for segment, reponse in reponses_par_chemin.items():
            if url.endswith(f"/{segment}"):
                return reponse
        raise AssertionError(f"URL inattendue dans le test : {url}")

    return _get


# --- synchroniser_classement ---


def test_synchroniser_classement_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.API_FOOTBALL_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_classement() == 0
    assert appele == []


def test_synchroniser_classement_upsert_les_lignes_et_traduit_la_forme(settings, monkeypatch):
    _configurer_cle_api(settings)
    standings = {
        "response": [
            {
                "league": {
                    "standings": [
                        [
                            {
                                "rank": 1,
                                "team": {"name": "Club Africain"},
                                "points": 23,
                                "goalsDiff": 12,
                                "form": "WWDLW",
                                "all": {
                                    "played": 10,
                                    "win": 7,
                                    "draw": 2,
                                    "lose": 1,
                                    "goals": {"for": 20, "against": 8},
                                },
                            }
                        ]
                    ]
                }
            }
        ]
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(_LIGUES_TROUVEES),
                "standings": _ReponseFactice(standings),
            }
        ),
    )

    total = services.synchroniser_classement()

    assert total == 1
    ligne = ClassementLigue.objects.get(saison="2025-2026", equipe="Club Africain")
    assert ligne.rang == 1
    assert ligne.points == 23
    # Ligue nationale (2025, "current": True) retenue, pas la coupe ni la compétition
    # continentale (pays "World") — voir _LIGUES_TROUVEES.
    assert ligne.forme_recente == "VVNDV"


def test_synchroniser_classement_appele_deux_fois_met_a_jour_sans_dupliquer(settings, monkeypatch):
    _configurer_cle_api(settings)
    standings = {
        "response": [
            {
                "league": {
                    "standings": [
                        [
                            {
                                "rank": 2,
                                "team": {"name": "Club Africain"},
                                "points": 20,
                                "goalsDiff": 5,
                                "form": "",
                                "all": {},
                            }
                        ]
                    ]
                }
            }
        ]
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(_LIGUES_TROUVEES),
                "standings": _ReponseFactice(standings),
            }
        ),
    )
    services.synchroniser_classement()

    standings["response"][0]["league"]["standings"][0][0]["rank"] = 1
    standings["response"][0]["league"]["standings"][0][0]["points"] = 23
    services.synchroniser_classement()

    assert ClassementLigue.objects.filter(saison="2025-2026", equipe="Club Africain").count() == 1
    ligne = ClassementLigue.objects.get(saison="2025-2026", equipe="Club Africain")
    assert ligne.rang == 1
    assert ligne.points == 23


def test_synchroniser_classement_ignore_une_ligne_au_format_inattendu(settings, monkeypatch):
    _configurer_cle_api(settings)
    standings = {"response": [{"league": {"standings": [[{"team": {}}]]}}]}
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(_LIGUES_TROUVEES),
                "standings": _ReponseFactice(standings),
            }
        ),
    )

    total = services.synchroniser_classement()

    assert total == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_equipe_introuvable_ne_fait_rien(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"teams": _ReponseFactice({"response": []})}))

    assert services.synchroniser_classement() == 0


def test_synchroniser_classement_ligue_nationale_introuvable_ne_fait_rien(settings, monkeypatch):
    _configurer_cle_api(settings)
    # Seulement des coupes/compétitions étrangères — aucune ligue nationale tunisienne.
    ligues_sans_championnat = {
        "response": [
            {
                "league": {"id": 909, "name": "Coupe", "type": "Cup"},
                "country": {"name": "Tunisia"},
                "seasons": [],
            },
        ]
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(ligues_sans_championnat),
            }
        ),
    )

    assert services.synchroniser_classement() == 0
    assert ClassementLigue.objects.count() == 0


def test_synchroniser_classement_reponse_http_en_echec_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"teams": _ReponseFactice({}, statut=500)}))

    assert services.synchroniser_classement() == 0


def test_synchroniser_classement_utilise_la_saison_explicite_si_definie(settings, monkeypatch):
    _configurer_cle_api(settings)
    settings.API_FOOTBALL_SAISON = "2024"
    standings = {
        "response": [
            {
                "league": {
                    "standings": [
                        [
                            {
                                "rank": 3,
                                "team": {"name": "Club Africain"},
                                "points": 15,
                                "goalsDiff": 0,
                                "form": "",
                                "all": {},
                            }
                        ]
                    ]
                }
            }
        ]
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(_LIGUES_TROUVEES),
                "standings": _ReponseFactice(standings),
            }
        ),
    )

    total = services.synchroniser_classement()

    assert total == 1
    assert ClassementLigue.objects.get(equipe="Club Africain").saison == "2024-2025"


# --- synchroniser_calendrier ---


def test_synchroniser_calendrier_sans_cle_api_ne_fait_rien(settings, monkeypatch):
    settings.API_FOOTBALL_KEY = ""
    appele = []
    monkeypatch.setattr(requests, "get", lambda *a, **k: appele.append(1))
    assert services.synchroniser_calendrier() == 0
    assert appele == []


def test_synchroniser_calendrier_equipe_introuvable_ne_leve_pas(settings, monkeypatch):
    _configurer_cle_api(settings)
    monkeypatch.setattr(requests, "get", _dispatch({"teams": _ReponseFactice({"response": []})}))

    assert services.synchroniser_calendrier() == 0


def test_synchroniser_calendrier_upsert_les_rencontres(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixtures = {
        "response": [
            {
                "fixture": {"id": 555111, "date": "2026-10-05T18:00:00+00:00"},
                "league": {"name": "Ligue 1"},
                "teams": {"home": {"name": "Club Africain"}, "away": {"name": "EST"}},
                "goals": {"home": None, "away": None},
            }
        ]
    }
    monkeypatch.setattr(
        requests,
        "get",
        _dispatch(
            {
                "teams": _ReponseFactice(_EQUIPE_TROUVEE),
                "leagues": _ReponseFactice(_LIGUES_TROUVEES),
                "fixtures": _ReponseFactice(fixtures),
            }
        ),
    )

    total = services.synchroniser_calendrier()

    # "next" et "last" pointent tous deux vers "fixtures" dans ce test (même corps simulé) —
    # deux upserts sur le même evenement_externe_id ne comptent qu'une seule ligne en base,
    # mais chaque appel incrémente bien le compteur retourné.
    assert total == 2
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="555111")
    assert rencontre.equipe_domicile == "Club Africain"
    assert rencontre.equipe_exterieur == "EST"
    assert rencontre.score_domicile is None


def test_synchroniser_calendrier_reporte_les_scores_et_la_date(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixtures_vides = {"response": []}
    fixtures_jouees = {
        "response": [
            {
                "fixture": {"id": 555222, "date": "2026-09-01T20:00:00+00:00"},
                "league": {"name": "Ligue 1"},
                "teams": {"home": {"name": "Club Africain"}, "away": {"name": "CS Sfaxien"}},
                "goals": {"home": 2, "away": 1},
            }
        ]
    }
    appels = {"n": 0}

    def _get(url, headers=None, params=None, timeout=None):
        if url.endswith("/teams"):
            return _ReponseFactice(_EQUIPE_TROUVEE)
        if url.endswith("/leagues"):
            return _ReponseFactice(_LIGUES_TROUVEES)
        appels["n"] += 1
        # Premier appel fixtures = "next" (vide), second = "last" (résultat joué).
        return _ReponseFactice(fixtures_vides if appels["n"] == 1 else fixtures_jouees)

    monkeypatch.setattr(requests, "get", _get)

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="555222")
    assert rencontre.score_domicile == 2
    assert rencontre.score_exterieur == 1


def test_synchroniser_calendrier_une_requete_en_echec_nempeche_pas_lautre(settings, monkeypatch):
    _configurer_cle_api(settings)
    fixtures_jouees = {
        "response": [
            {
                "fixture": {"id": 555333, "date": "2026-09-01T20:00:00+00:00"},
                "league": {"name": "Ligue 1"},
                "teams": {"home": {"name": "Club Africain"}, "away": {"name": "CS Sfaxien"}},
                "goals": {"home": 2, "away": 1},
            }
        ]
    }
    appels = {"n": 0}

    def _get(url, headers=None, params=None, timeout=None):
        if url.endswith("/teams"):
            return _ReponseFactice(_EQUIPE_TROUVEE)
        if url.endswith("/leagues"):
            return _ReponseFactice(_LIGUES_TROUVEES)
        appels["n"] += 1
        if appels["n"] == 1:
            raise requests.ConnectionError("timeout simulé")
        return _ReponseFactice(fixtures_jouees)

    monkeypatch.setattr(requests, "get", _get)

    total = services.synchroniser_calendrier()

    assert total == 1
    rencontre = RencontreCalendrier.objects.get(evenement_externe_id="555333")
    assert rencontre.score_domicile == 2
    assert rencontre.score_exterieur == 1

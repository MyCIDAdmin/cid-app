"""
Tests API — ConfigurationRelanceViewSet (AHM-54, suite retour utilisateur sur AHM-18).

Même niveau de permission que marquer_payee (Directeur Financier/Admin) — voir
apps.cotisations.tests.test_api pour les tests équivalents sur /cotisations/{id}/marquer-payee/.
"""

from datetime import date

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ConfigurationRelance
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

LIST_URL = "cotisations:configuration-relance-list"


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _detail_url(config):
    return reverse("cotisations:configuration-relance-detail", args=[config.id])


# --- Permissions ---


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 401


def test_membre_ne_peut_pas_lister(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 403


def test_rh_ne_peut_pas_lister(api_client):
    # Le RH garde un accès en lecture seule sur /cotisations/ mais pas sur ce paramétrage —
    # même choix que marquer_payee (SAISIE_POUR_AUTRUI_MIN_LEVEL = Directeur Financier).
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 403


def test_directeur_financier_peut_lister(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["annee"] == 2027


def test_admin_peut_lister(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 200


# --- Création / modification ---


def test_directeur_financier_peut_creer_une_echeance(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 201, resp.data
    assert resp.data["annee"] == 2027
    assert resp.data["date_echeance"] == "2027-03-15"
    # modifie_par est résolu côté serveur (l'utilisateur courant), jamais transmis par le client.
    config = ConfigurationRelance.objects.get()
    assert config.modifie_par == membre


def test_membre_ne_peut_pas_creer_une_echeance(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 403
    assert ConfigurationRelance.objects.count() == 0


def test_creation_refusee_si_annee_deja_configuree(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 400


def test_directeur_financier_peut_modifier_une_echeance(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(config), {"date_echeance": "2027-04-01"})

    assert resp.status_code == 200, resp.data
    config.refresh_from_db()
    assert config.date_echeance == date(2027, 4, 1)
    assert config.modifie_par == membre


def test_membre_ne_peut_pas_modifier_une_echeance(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(config), {"date_echeance": "2027-04-01"})

    assert resp.status_code == 403
    config.refresh_from_db()
    assert config.date_echeance == date(2027, 1, 1)


def test_directeur_financier_peut_supprimer_une_echeance(api_client):
    # Revenir au comportement par défaut (1er janvier) pour une année donnée.
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 3, 15))
    _auth(api_client, user)

    resp = api_client.delete(_detail_url(config))

    assert resp.status_code == 204
    assert ConfigurationRelance.objects.count() == 0

"""Tests API — app stats (accès réservé Admin/DG/Bureau Admin — FDD écrans Release 1 §2.3)."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.tests.factories import CotisationFactory
from apps.evenements.models import StatutEvenement
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


FINANCIER_URL = "stats:financier"
MEMBRES_URL = "stats:membres"
EVENEMENTS_URL = "stats:evenements"


def test_financier_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(FINANCIER_URL))
    assert resp.status_code == 401


def test_membre_normal_ne_peut_pas_voir_les_stats(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m1@example.de")
    resp = _auth(api_client, user).get(reverse(FINANCIER_URL))
    assert resp.status_code == 403


def test_rh_ne_peut_pas_voir_les_stats(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    resp = _auth(api_client, user).get(reverse(FINANCIER_URL))
    assert resp.status_code == 403


def test_bureau_admin_peut_voir_les_stats_financieres(api_client):
    user, membre = _user_avec_membre(Role.BUREAU_ADMIN, "bureau1@example.de")
    CotisationFactory(membre=membre)

    resp = _auth(api_client, user).get(reverse(FINANCIER_URL))
    assert resp.status_code == 200
    assert Decimal(resp.data["recettes"]) == Decimal("45.00")
    assert "top_contributeurs" in resp.data


def test_directeur_financier_peut_voir_les_stats_membres(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "dg1@example.de")
    MembreFactory(statut=StatutMembre.ACTIF, ville_de="Berlin")
    MembreFactory(statut=StatutMembre.INACTIF, ville_de="Berlin")

    resp = _auth(api_client, user).get(reverse(MEMBRES_URL))
    assert resp.status_code == 200
    assert resp.data["total"] >= 2
    assert resp.data["actifs"] >= 1


def test_admin_peut_voir_les_stats_evenements(api_client):
    user, membre = _user_avec_membre(Role.SUPER_ADMIN, "admin1@example.de")
    evenement = EvenementFactory(statut=StatutEvenement.PUBLIE, places_max=10)
    InscriptionFactory(evenement=evenement, membre=membre, places=2)

    resp = _auth(api_client, user).get(
        reverse(EVENEMENTS_URL), {"annee": evenement.date_evenement.year}
    )
    assert resp.status_code == 200
    assert resp.data["nombre_evenements"] >= 1
    assert resp.data["inscriptions_totales"] >= 2


def test_annee_invalide_refusee(api_client):
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "admin2@example.de")
    resp = _auth(api_client, user).get(reverse(FINANCIER_URL), {"annee": "pas-une-annee"})
    assert resp.status_code == 400

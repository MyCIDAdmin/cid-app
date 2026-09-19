"""Tests API — ParametresNotification (ajouté le 2026-09-19, demande utilisateur : emails de
notification activables/désactivables par module par l'Administrateur App)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.notifications.models import ParametresNotification
from apps.notifications.services import email_module_actif
from apps.notifications.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

URL = "notifications:parametres-notification"


@pytest.fixture
def api_client():
    return APIClient()


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def test_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(URL))
    assert resp.status_code == 401


def test_membre_normal_refuse(api_client):
    membre = UserFactory(role=Role.MEMBRE)
    resp = _auth(api_client, membre).get(reverse(URL))
    assert resp.status_code == 403


def test_directeur_financier_refuse(api_client):
    """Réservé à l'Administrateur App — même un rôle de gestion élevé (Directeur Financier)
    n'y a pas accès, contrairement à ArticleCataloguePermission (lecture ouverte)."""
    user = UserFactory(role=Role.DIR_FINANCIER)
    resp = _auth(api_client, user).get(reverse(URL))
    assert resp.status_code == 403


def test_admin_app_lit_les_parametres_par_defaut_tous_actifs(api_client):
    admin = UserFactory(role=Role.SUPER_ADMIN)
    resp = _auth(api_client, admin).get(reverse(URL))
    assert resp.status_code == 200
    for module in [
        "membres",
        "cotisations",
        "adhesions",
        "evenements",
        "boutique",
        "vote",
        "communaute",
    ]:
        assert resp.data[f"email_{module}"] is True


def test_admin_app_desactive_un_module(api_client):
    admin = UserFactory(role=Role.SUPER_ADMIN)
    resp = _auth(api_client, admin).patch(reverse(URL), {"email_boutique": False})
    assert resp.status_code == 200
    assert resp.data["email_boutique"] is False
    assert resp.data["email_cotisations"] is True  # les autres modules ne sont pas touchés

    parametres = ParametresNotification.get_solo()
    assert parametres.email_boutique is False


def test_membre_normal_ne_peut_pas_modifier(api_client):
    membre = UserFactory(role=Role.MEMBRE)
    resp = _auth(api_client, membre).patch(reverse(URL), {"email_boutique": False})
    assert resp.status_code == 403
    assert ParametresNotification.get_solo().email_boutique is True


def test_get_solo_est_un_singleton(db):
    p1 = ParametresNotification.get_solo()
    p1.email_vote = False
    p1.save(update_fields=["email_vote"])

    p2 = ParametresNotification.get_solo()
    assert p2.pk == p1.pk
    assert p2.email_vote is False


def test_email_module_actif_reflete_le_parametrage(db):
    assert email_module_actif("boutique") is True

    parametres = ParametresNotification.get_solo()
    parametres.email_boutique = False
    parametres.save(update_fields=["email_boutique"])

    assert email_module_actif("boutique") is False
    assert email_module_actif("cotisations") is True


def test_email_module_actif_module_inconnu_fail_open(db):
    """Un nom de module non répertorié (jamais censé arriver) ne coupe jamais silencieusement
    un email — voir docstring de email_module_actif."""
    assert email_module_actif("inconnu") is True

"""Tests API — app notifications (SCD §2.3 A01 : IDOR)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier
from apps.notifications.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


LIST_URL = "notifications:notification-list"
TOUT_MARQUER_LU_URL = "notifications:notification-tout-marquer-lu"
MARQUER_LUES_PREFIXE_URL = "notifications:notification-marquer-lues-prefixe"
NON_LUES_COUNT_URL = "notifications:notification-non-lues-count"


def _marquer_lue_url(notification):
    return reverse("notifications:notification-marquer-lue", args=[notification.id])


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 401


def test_membre_ne_voit_que_ses_propres_notifications(api_client):
    user1 = UserFactory(email="u1@example.de")
    user2 = UserFactory(email="u2@example.de")
    notifier(user1, TypeNotification.BIENVENUE, titre="Bienvenue", message="msg")
    notifier(user2, TypeNotification.BIENVENUE, titre="Bienvenue", message="msg")

    resp = _auth(api_client, user1).get(reverse(LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_filtre_par_lu(api_client):
    user = UserFactory(email="u3@example.de")
    n1 = notifier(user, TypeNotification.BIENVENUE, titre="A", message="a")
    notifier(user, TypeNotification.PAIEMENT_CONFIRME, titre="B", message="b")
    n1.lu = True
    n1.save(update_fields=["lu"])

    resp = _auth(api_client, user).get(reverse(LIST_URL), {"lu": "false"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["titre"] == "B"


def test_marquer_lue_sa_propre_notification(api_client):
    user = UserFactory(email="u4@example.de")
    notification = notifier(user, TypeNotification.BIENVENUE, titre="A", message="a")

    resp = _auth(api_client, user).post(_marquer_lue_url(notification))
    assert resp.status_code == 200
    assert resp.data["lu"] is True

    notification.refresh_from_db()
    assert notification.lu is True


def test_marquer_lue_notification_dun_autre_refuse(api_client):
    user1 = UserFactory(email="u5@example.de")
    user2 = UserFactory(email="u6@example.de")
    notification = notifier(user2, TypeNotification.BIENVENUE, titre="A", message="a")

    resp = _auth(api_client, user1).post(_marquer_lue_url(notification))
    assert resp.status_code in (403, 404)

    notification.refresh_from_db()
    assert notification.lu is False


def test_tout_marquer_lu_ne_touche_que_mes_notifications(api_client):
    user1 = UserFactory(email="u7@example.de")
    user2 = UserFactory(email="u8@example.de")
    notifier(user1, TypeNotification.BIENVENUE, titre="A", message="a")
    notifier(user1, TypeNotification.PAIEMENT_CONFIRME, titre="B", message="b")
    autre = notifier(user2, TypeNotification.BIENVENUE, titre="C", message="c")

    resp = _auth(api_client, user1).post(reverse(TOUT_MARQUER_LU_URL))
    assert resp.status_code == 200
    assert resp.data["marquees"] == 2

    autre.refresh_from_db()
    assert autre.lu is False


def test_marquer_lues_prefixe_ne_touche_que_le_module_demande(api_client):
    """Ajouté le 2026-09-16 — point d'activité de la sidebar (Sidebar.tsx) : visiter un module
    marque ses notifications comme lues sans toucher aux autres modules ni aux autres membres."""
    user1 = UserFactory(email="u10@example.de")
    user2 = UserFactory(email="u11@example.de")
    evenement = notifier(
        user1, TypeNotification.EVENEMENT_INVITATION, titre="A", message="a", lien="/evenements/1"
    )
    cotisation = notifier(
        user1, TypeNotification.RELANCE_COTISATION, titre="B", message="b", lien="/cotisations"
    )
    autre_membre = notifier(
        user2, TypeNotification.EVENEMENT_INVITATION, titre="C", message="c", lien="/evenements/1"
    )

    resp = _auth(api_client, user1).post(
        reverse(MARQUER_LUES_PREFIXE_URL), {"prefixe": "/evenements"}
    )
    assert resp.status_code == 200
    assert resp.data["marquees"] == 1

    evenement.refresh_from_db()
    cotisation.refresh_from_db()
    autre_membre.refresh_from_db()
    assert evenement.lu is True
    assert cotisation.lu is False  # autre module, pas touché
    assert autre_membre.lu is False  # autre utilisateur, pas touché (IDOR)


def test_marquer_lues_prefixe_sans_prefixe_ne_marque_rien(api_client):
    user = UserFactory(email="u12@example.de")
    notification = notifier(
        user, TypeNotification.BIENVENUE, titre="A", message="a", lien="/dashboard"
    )

    resp = _auth(api_client, user).post(reverse(MARQUER_LUES_PREFIXE_URL), {})
    assert resp.status_code == 200
    assert resp.data["marquees"] == 0

    notification.refresh_from_db()
    assert notification.lu is False


def test_non_lues_count(api_client):
    user = UserFactory(email="u9@example.de")
    notifier(user, TypeNotification.BIENVENUE, titre="A", message="a")
    lue = notifier(user, TypeNotification.PAIEMENT_CONFIRME, titre="B", message="b")
    lue.lu = True
    lue.save(update_fields=["lu"])

    resp = _auth(api_client, user).get(reverse(NON_LUES_COUNT_URL))
    assert resp.status_code == 200
    assert resp.data["count"] == 1

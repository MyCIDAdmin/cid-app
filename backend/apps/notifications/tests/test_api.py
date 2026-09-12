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


def test_non_lues_count(api_client):
    user = UserFactory(email="u9@example.de")
    notifier(user, TypeNotification.BIENVENUE, titre="A", message="a")
    lue = notifier(user, TypeNotification.PAIEMENT_CONFIRME, titre="B", message="b")
    lue.lu = True
    lue.save(update_fields=["lu"])

    resp = _auth(api_client, user).get(reverse(NON_LUES_COUNT_URL))
    assert resp.status_code == 200
    assert resp.data["count"] == 1

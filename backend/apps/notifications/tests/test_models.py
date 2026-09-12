import pytest

from apps.notifications.models import TypeNotification
from apps.notifications.tests.factories import NotificationFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_notification_non_lue_par_defaut():
    notification = NotificationFactory()
    assert notification.lu is False


def test_str_inclut_le_type_et_le_destinataire():
    user = UserFactory(email="destinataire@example.de")
    notification = NotificationFactory(
        destinataire=user, type_notification=TypeNotification.PAIEMENT_CONFIRME
    )
    texte = str(notification)
    assert "Paiement confirmé" in texte
    assert "destinataire@example.de" in texte

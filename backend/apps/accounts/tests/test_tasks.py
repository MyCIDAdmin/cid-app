"""Tests tâches Celery — app accounts."""

import pytest

from apps.accounts.models import User
from apps.accounts.tasks import send_registration_approved_email
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


def test_approbation_inscription_envoie_email_et_notification_bienvenue(mailoutbox):
    user = User.objects.create_user(
        email="nouveau@example.de", password="Password123!", is_active=True
    )

    send_registration_approved_email(str(user.id))

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["nouveau@example.de"]

    notification = Notification.objects.get(destinataire=user)
    assert notification.type_notification == TypeNotification.BIENVENUE
    assert notification.lu is False

"""Tests tâches Celery — app accounts."""

import pytest

from apps.accounts.models import Role, User
from apps.accounts.tasks import notifier_nouvelle_inscription_rh, send_registration_approved_email
from apps.membres.tests.factories import MembreFactory
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


def test_nouvelle_inscription_notifie_tout_rh_plus(mailoutbox):
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — voir
    tasks.notifier_nouvelle_inscription_rh, déclenchée par `RegisterConfirmView.post`."""
    postulant = User.objects.create_user(
        email="postulant@example.de", password="Password123!", is_active=False
    )
    MembreFactory(user=postulant, prenom="Amine", nom="Ben Ali")
    rh = User.objects.create_user(
        email="rh@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    bureau = User.objects.create_user(
        email="bureau@example.de", password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )
    membre_normal = User.objects.create_user(
        email="membre@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )

    notifier_nouvelle_inscription_rh(str(postulant.id))

    for destinataire in (rh, bureau):
        notification = Notification.objects.get(destinataire=destinataire)
        assert notification.type_notification == TypeNotification.ACCOUNTS_NOUVELLE_INSCRIPTION
        assert "Amine Ben Ali" in notification.message
        assert notification.lien == "/inscriptions"
    assert not Notification.objects.filter(destinataire=membre_normal).exists()
    # Aucun email — file d'attente partagée, pas de destinataire individuel (voir docstring).
    assert len(mailoutbox) == 0


def test_nouvelle_inscription_utilisateur_introuvable_ne_leve_pas():
    notifier_nouvelle_inscription_rh("00000000-0000-0000-0000-000000000000")

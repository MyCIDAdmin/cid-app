"""Tests tâches Celery envoi d'email — statut de membre (ajouté le 2026-09-19). Même principe que
apps.adhesions.tests.test_tasks/apps.boutique.tests.test_tasks : le task est appelé directement
(pas via .delay()) et `mailoutbox` (pytest-django) capture les envois sans jamais toucher un vrai
serveur SMTP."""

import pytest

from apps.accounts.models import User
from apps.membres.tasks import envoyer_email_statut_actif, envoyer_email_statut_inactif
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _membre_avec_compte(email="riadh@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user)


def test_envoyer_email_statut_actif(mailoutbox):
    membre = _membre_avec_compte()

    envoyer_email_statut_actif(str(membre.id), 2027)

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["riadh@example.de"]
    assert "actif" in mailoutbox[0].subject.lower()


def test_envoyer_email_statut_inactif(mailoutbox):
    membre = _membre_avec_compte()

    envoyer_email_statut_inactif(str(membre.id), 2027)

    assert len(mailoutbox) == 1
    assert mailoutbox[0].to == ["riadh@example.de"]
    assert "inactif" in mailoutbox[0].subject.lower()


def test_envoyer_email_statut_actif_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    membre = MembreFactory()  # pas de user lié

    envoyer_email_statut_actif(str(membre.id), 2027)

    assert len(mailoutbox) == 0


def test_envoyer_email_statut_membre_introuvable_ne_leve_pas(mailoutbox):
    envoyer_email_statut_actif("00000000-0000-0000-0000-000000000000", 2027)
    envoyer_email_statut_inactif("00000000-0000-0000-0000-000000000000", 2027)
    assert len(mailoutbox) == 0

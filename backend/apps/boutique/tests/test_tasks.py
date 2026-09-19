"""Tests tâches Celery envoi d'email — app boutique (ajouté le 2026-09-19, correctif : voir
docstring de apps.boutique.tasks). Même principe que apps.adhesions.tests.test_tasks : le task
est appelé directement (pas via .delay()) et `mailoutbox` (pytest-django) capture les envois
sans jamais toucher un vrai serveur SMTP."""

import pytest
from decimal import Decimal

from apps.accounts.models import User
from apps.boutique.models import StatutCommande
from apps.boutique.tasks import (
    envoyer_email_commande_annulee,
    envoyer_email_commande_confirmee,
    envoyer_email_commande_expediee,
)
from apps.boutique.tests.factories import CommandeFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _membre_avec_compte(email="riadh@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user)


def test_envoyer_email_commande_confirmee(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, montant_total=Decimal("45.00"))

    envoyer_email_commande_confirmee(str(commande.id))

    assert len(mailoutbox) == 1
    assert commande.numero_commande in mailoutbox[0].subject
    assert mailoutbox[0].to == ["riadh@example.de"]


def test_envoyer_email_commande_confirmee_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    # Membre sans User lié (FK nullable) — comportement historique : aucun envoi, aucune erreur.
    membre = MembreFactory()
    commande = CommandeFactory(membre=membre)

    envoyer_email_commande_confirmee(str(commande.id))

    assert len(mailoutbox) == 0


def test_envoyer_email_commande_confirmee_commande_introuvable_ne_leve_pas(mailoutbox):
    envoyer_email_commande_confirmee("00000000-0000-0000-0000-000000000000")
    assert len(mailoutbox) == 0


def test_envoyer_email_commande_annulee(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, statut=StatutCommande.ANNULEE)

    envoyer_email_commande_annulee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "annulée" in mailoutbox[0].subject


def test_envoyer_email_commande_expediee_inclut_le_numero_de_suivi(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(
        membre=membre,
        statut=StatutCommande.EXPEDIEE,
        numero_suivi="DHL123456789",
        transporteur="DHL",
    )

    envoyer_email_commande_expediee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "DHL123456789" in mailoutbox[0].body
    assert "DHL" in mailoutbox[0].body


def test_envoyer_email_commande_expediee_sans_numero_de_suivi(mailoutbox):
    membre = _membre_avec_compte()
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)

    envoyer_email_commande_expediee(str(commande.id))

    assert len(mailoutbox) == 1
    assert "Numéro de suivi" not in mailoutbox[0].body

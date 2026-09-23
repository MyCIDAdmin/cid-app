"""Tests tâches Celery envoi d'email — app boutique (ajouté le 2026-09-19, correctif : voir
docstring de apps.boutique.tasks). Même principe que apps.adhesions.tests.test_tasks : le task
est appelé directement (pas via .delay()) et `mailoutbox` (pytest-django) capture les envois
sans jamais toucher un vrai serveur SMTP."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.boutique.models import StatutBonAchat, StatutCommande
from apps.boutique.tasks import (
    envoyer_email_bon_achat_code,
    envoyer_email_commande_annulee,
    envoyer_email_commande_confirmee,
    envoyer_email_commande_expediee,
)
from apps.boutique.tests.factories import BonAchatFactory, CommandeFactory
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


# --- envoyer_email_bon_achat_code (demande utilisateur du 2026-09-23, seul email HTML du
# module — voir apps.boutique.emails) ---


def test_envoyer_email_bon_achat_code(mailoutbox):
    membre = _membre_avec_compte()
    bon = BonAchatFactory(
        achete_par=membre,
        statut=StatutBonAchat.ACTIF,
        montant_initial=Decimal("80.00"),
        solde=Decimal("80.00"),
        date_expiration=timezone.now() + timedelta(days=365 * 3),
    )

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    message = mailoutbox[0]
    assert bon.code in message.subject
    assert message.to == ["riadh@example.de"]
    # Corps texte brut (repli) : code, montant, date d'expiration.
    assert bon.code in message.body
    assert "80,00 €" in message.body
    # Seul email HTML de tout le projet : une alternative text/html doit être jointe.
    assert len(message.alternatives) == 1
    corps_html, mimetype = message.alternatives[0]
    assert mimetype == "text/html"
    assert bon.code in corps_html
    assert "80,00 €" in corps_html


def test_envoyer_email_bon_achat_code_logo_en_piece_jointe_inline_jamais_en_data_uri(mailoutbox):
    # Régression (bug réel constaté en production le 2026-09-23, rapport utilisateur : logo non
    # affiché + email tronqué par Gmail "[Message clipped]") — voir docstring de
    # apps.boutique.emails. Le logo (~80 Ko en pleine résolution) ne doit plus jamais être
    # encodé en `data:` URI dans le HTML (gonfle l'email au-delà du seuil de troncature Gmail
    # ~102 Ko ET est de toute façon strippé par la plupart des clients mail) : il doit être une
    # pièce jointe inline référencée par Content-ID (cid:).
    membre = _membre_avec_compte()
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    message = mailoutbox[0]
    corps_html, _ = message.alternatives[0]

    # Plus aucune image encodée en base64 dans le HTML.
    assert "data:image" not in corps_html
    assert "cid:logo-cid-email" in corps_html

    # Le logo est bien joint en pièce jointe inline, avec le Content-ID correspondant.
    assert len(message.attachments) == 1
    logo = message.attachments[0]
    content_id = logo.get("Content-ID", "")
    assert content_id == "<logo-cid-email>"
    assert logo.get("Content-Disposition", "").startswith("inline")

    # Le message complet (texte + HTML + pièce jointe) reste largement sous le seuil de
    # troncature de Gmail (~102 Ko) — l'ancien data: URI faisait à lui seul ~109 Ko.
    taille_totale = len(message.message().as_bytes())
    assert taille_totale < 50_000


def test_envoyer_email_bon_achat_code_respecte_la_langue_preferee(mailoutbox):
    membre = _membre_avec_compte()
    membre.user.langue_preferee = "de"
    membre.user.save(update_fields=["langue_preferee"])
    bon = BonAchatFactory(
        achete_par=membre,
        statut=StatutBonAchat.ACTIF,
        date_expiration=timezone.now() + timedelta(days=365 * 3),
    )

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 1
    assert "Gutschein" in mailoutbox[0].subject


def test_envoyer_email_bon_achat_code_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    # Membre sans User lié (FK nullable) — comportement identique aux emails de commande.
    membre = MembreFactory()
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)

    envoyer_email_bon_achat_code(str(bon.id))

    assert len(mailoutbox) == 0


def test_envoyer_email_bon_achat_code_bon_introuvable_ne_leve_pas(mailoutbox):
    envoyer_email_bon_achat_code("00000000-0000-0000-0000-000000000000")
    assert len(mailoutbox) == 0

"""
Tests — apps.boutique.webhooks (ajouté le 2026-09-17, même principe que
apps.cotisations.webhooks/AHM-46). Les vues sont de simples vues Django (pas DRF) : pas
d'authentification JWT, appelées ici via le client de test Django standard. La vérification de
signature elle-même (stripe.Webhook.construct_event / verifier_signature_webhook_paypal) est
mockée — elle est testée indépendamment dans apps.cotisations.tests.test_gateways.

Depuis le 2026-09-23 (achat de bon d'achat intégré au catalogue, voir docstring de tête de
models.py), un bon d'achat n'a plus son propre espace de webhooks (l'ancien préfixe "BON-" a été
supprimé, voir _resoudre_reference) : ces webhooks ne confirment plus jamais qu'une Commande — un
BonAchat est généré en conséquence, via `_generer_bons_achat`, quand cette commande contient des
lignes bon_achat (voir la section dédiée en bas de fichier).
"""

import json
from decimal import Decimal
from unittest.mock import patch

import pytest
import stripe
from django.urls import reverse

from apps.boutique.models import BonAchat, Commande, ModePaiementCommande, StatutCommande
from apps.boutique.tests.factories import (
    CommandeFactory,
    LigneCommandeFactory,
    ProduitBonAchatFactory,
)

pytestmark = pytest.mark.django_db

STRIPE_WEBHOOK_URL = "boutique:webhook-stripe"
PAYPAL_WEBHOOK_URL = "boutique:webhook-paypal"


def _commande_en_attente(**overrides):
    defaults = {"statut": StatutCommande.EN_ATTENTE}
    defaults.update(overrides)
    return CommandeFactory(**defaults)


def _ligne_bon_achat(commande, montant=Decimal("50.00"), quantite=1):
    """Une ligne bon_achat rattachée à `commande` — même principe que
    CommandeViewSet._construire_ligne_avec_reduction pour ce type de produit (montant choisi par
    l'acheteur, pas de réduction quantité, voir docstring de tête de models.py)."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()  # sentinelle auto-créée par Produit.save()
    return LigneCommandeFactory(
        commande=commande,
        variante=variante,
        quantite=quantite,
        prix_unitaire=montant,
        quantite_offerte=0,
        pourcentage_reduction_quantite=None,
        reduction_quantite=Decimal("0.00"),
    )


def _post_json(client, url_name, body: dict, headers: dict | None = None):
    return client.post(
        reverse(url_name),
        data=json.dumps(body),
        content_type="application/json",
        **(headers or {}),
    )


@pytest.fixture(autouse=True)
def _stripe_webhook_secret(settings):
    """Die Signaturprüfung selbst wird gemockt ; ein Secret muss aber konfiguriert sein, weil der
    Webhook ohne Secret abgelehnt wird (fail closed, Sicherheitsprüfung 2026-10-07)."""
    settings.STRIPE_WEBHOOK_SECRET = "whsec_test"


# --- Stripe ---


def test_stripe_signature_invalide_refusee(client):
    with patch(
        "stripe.Webhook.construct_event",
        side_effect=stripe.error.SignatureVerificationError("bad sig", "sig"),
    ):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {}, {"HTTP_STRIPE_SIGNATURE": "xxx"})

    assert resp.status_code == 400


def test_stripe_ohne_konfiguriertes_secret_wird_abgelehnt(client, settings):
    settings.STRIPE_WEBHOOK_SECRET = ""

    resp = _post_json(client, STRIPE_WEBHOOK_URL, {}, {"HTTP_STRIPE_SIGNATURE": "xxx"})

    assert resp.status_code == 400


def test_stripe_checkout_session_completed_confirme_le_paiement(client):
    commande = _commande_en_attente()
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(commande.id),
                "payment_intent": "pi_123",
                "id": "cs_123",
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE
    assert commande.mode_paiement == ModePaiementCommande.EN_LIGNE
    assert commande.reference_paiement == "STRIPE-pi_123"
    assert commande.date_paiement_confirme is not None
    assert commande.paiement_confirme_par is None  # confirmé par le PSP, pas un membre du staff


def test_stripe_rejeu_idempotent(client):
    commande = _commande_en_attente()
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": str(commande.id), "payment_intent": "pi_1"}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        _post_json(client, STRIPE_WEBHOOK_URL, {})
        _post_json(client, STRIPE_WEBHOOK_URL, {})

    commande.refresh_from_db()
    assert commande.reference_paiement == "STRIPE-pi_1"  # inchangé au second appel


def test_stripe_session_expiree_laisse_la_commande_en_attente(client):
    # Contrairement à Cotisation, Commande n'a pas de statut "échouée" — voir docstring module.
    commande = _commande_en_attente()
    event = {
        "type": "checkout.session.expired",
        "data": {"object": {"client_reference_id": str(commande.id)}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.EN_ATTENTE


def test_stripe_session_expiree_ne_touche_pas_une_commande_deja_confirmee(client):
    commande = CommandeFactory(statut=StatutCommande.CONFIRMEE)
    event = {
        "type": "checkout.session.expired",
        "data": {"object": {"client_reference_id": str(commande.id)}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        _post_json(client, STRIPE_WEBHOOK_URL, {})

    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE


def test_stripe_commande_introuvable_repond_200(client):
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": "00000000-0000-0000-0000-000000000000"}},
    }
    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})
    assert resp.status_code == 200


def test_stripe_sans_client_reference_id_repond_200(client):
    event = {"type": "checkout.session.completed", "data": {"object": {}}}
    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})
    assert resp.status_code == 200
    assert Commande.objects.filter(statut=StatutCommande.CONFIRMEE).count() == 0


# --- PayPal ---


def test_paypal_signature_invalide_refusee(client):
    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=False):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, {"event_type": "PAYMENT.CAPTURE.COMPLETED"})

    assert resp.status_code == 400


def test_paypal_payload_invalide_refuse(client):
    resp = client.post(
        reverse(PAYPAL_WEBHOOK_URL), data=b"{not json", content_type="application/json"
    )
    assert resp.status_code == 400


def test_paypal_order_approved_capture_et_confirme(client):
    commande = _commande_en_attente()
    event = {
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {
            "id": "ORDER-1",
            "purchase_units": [{"custom_id": str(commande.id)}],
        },
    }
    capture_data = {
        "purchase_units": [{"payments": {"captures": [{"id": "CAPTURE-1"}]}}],
    }

    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
        with patch("apps.boutique.webhooks.capturer_commande_paypal", return_value=capture_data):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE
    assert commande.mode_paiement == ModePaiementCommande.EN_LIGNE
    assert commande.reference_paiement == "PAYPAL-CAPTURE-1"


def test_paypal_order_approved_capture_echouee_ne_modifie_rien(client):
    from apps.cotisations.gateways import GatewayError

    commande = _commande_en_attente()
    event = {
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {"id": "ORDER-1", "purchase_units": [{"custom_id": str(commande.id)}]},
    }

    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
        with patch(
            "apps.boutique.webhooks.capturer_commande_paypal",
            side_effect=GatewayError("échec"),
        ):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200  # on acquitte quand même — pas de retry PayPal infini
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.EN_ATTENTE


def test_paypal_payment_capture_completed_confirme(client):
    commande = _commande_en_attente()
    event = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": "CAPTURE-2", "custom_id": str(commande.id)},
    }

    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE
    assert commande.reference_paiement == "PAYPAL-CAPTURE-2"


def test_paypal_payment_capture_denied_laisse_la_commande_en_attente(client):
    commande = _commande_en_attente()
    event = {
        "event_type": "PAYMENT.CAPTURE.DENIED",
        "resource": {"id": "CAPTURE-3", "custom_id": str(commande.id)},
    }

    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.EN_ATTENTE


# --- Bons d'achat générés à la confirmation (demande utilisateur du 2026-09-23, achat intégré
# au catalogue — voir views._generer_bons_achat) : plus de webhook dédié à un BonAchat, c'est la
# confirmation de LA COMMANDE qui contient une ligne bon_achat qui déclenche leur génération. Le
# patch cible `apps.boutique.views.notifier_bon_achat_actif` (jamais
# `apps.boutique.notifications.notifier_bon_achat_actif`) : _generer_bons_achat vit dans views.py
# et y a importé son propre nom au chargement du module, patcher l'original ne l'atteindrait pas.


def test_stripe_checkout_session_completed_genere_les_bons_achat_de_la_commande(client):
    commande = _commande_en_attente()
    _ligne_bon_achat(commande, montant=Decimal("50.00"), quantite=2)
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(commande.id),
                "payment_intent": "pi_bon_1",
                "id": "cs_bon_1",
            }
        },
    }

    with patch("apps.boutique.views.notifier_bon_achat_actif") as mock_notifier:
        with patch("stripe.Webhook.construct_event", return_value=event):
            resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE
    bons = list(BonAchat.objects.filter(achete_par=commande.membre))
    assert len(bons) == 2  # quantite=2 sur la ligne -> deux bons indépendants
    for bon in bons:
        assert bon.montant_initial == Decimal("50.00")
        assert bon.solde == Decimal("50.00")
        assert bon.statut == "actif"
        assert bon.date_expiration is not None
    assert mock_notifier.call_count == 2


def test_stripe_rejeu_idempotent_ne_duplique_pas_les_bons_achat(client):
    commande = _commande_en_attente()
    _ligne_bon_achat(commande, montant=Decimal("50.00"), quantite=1)
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": str(commande.id), "payment_intent": "pi_bon_2"}},
    }

    with patch("apps.boutique.views.notifier_bon_achat_actif") as mock_notifier:
        with patch("stripe.Webhook.construct_event", return_value=event):
            _post_json(client, STRIPE_WEBHOOK_URL, {})
            _post_json(client, STRIPE_WEBHOOK_URL, {})

    # La garde d'idempotence de _confirmer_paiement_gateway (commande déjà CONFIRMEE au second
    # appel) empêche un second appel à _generer_bons_achat — un seul bon, un seul email.
    assert BonAchat.objects.filter(achete_par=commande.membre).count() == 1
    mock_notifier.assert_called_once()


def test_stripe_commande_sans_ligne_bon_achat_ne_genere_aucun_bon(client):
    commande = _commande_en_attente()  # aucune ligne bon_achat
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {"client_reference_id": str(commande.id), "payment_intent": "pi_normal"}
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    assert BonAchat.objects.count() == 0


def test_paypal_payment_capture_completed_genere_les_bons_achat_de_la_commande(client):
    commande = _commande_en_attente()
    _ligne_bon_achat(commande, montant=Decimal("25.00"), quantite=1)
    event = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": "CAPTURE-BON-2", "custom_id": str(commande.id)},
    }

    with patch("apps.boutique.views.notifier_bon_achat_actif") as mock_notifier:
        with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    commande.refresh_from_db()
    assert commande.statut == StatutCommande.CONFIRMEE
    bon = BonAchat.objects.get(achete_par=commande.membre)
    assert bon.montant_initial == Decimal("25.00")
    mock_notifier.assert_called_once_with(bon)

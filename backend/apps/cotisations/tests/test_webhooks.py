"""
Tests — apps.cotisations.webhooks (AHM-46). Les vues sont de simples vues Django (pas DRF) : pas
d'authentification JWT, appelées ici via le client de test Django standard. La vérification de
signature elle-même (stripe.Webhook.construct_event / verifier_signature_webhook_paypal) est
mockée — elle est testée indépendamment dans test_gateways.py.
"""

import json
from unittest.mock import patch

import pytest
import stripe
from django.urls import reverse

from apps.cotisations.models import Cotisation, ModePaiement, StatutCotisation
from apps.cotisations.tests.factories import CotisationFactory

pytestmark = pytest.mark.django_db

STRIPE_WEBHOOK_URL = "cotisations:webhook-stripe"
PAYPAL_WEBHOOK_URL = "cotisations:webhook-paypal"


def _cotisation_en_attente(**overrides):
    defaults = {"statut": StatutCotisation.EN_ATTENTE, "reference_transaction": None}
    defaults.update(overrides)
    return CotisationFactory(**defaults)


def _post_json(client, url_name, body: dict, headers: dict | None = None):
    return client.post(
        reverse(url_name),
        data=json.dumps(body),
        content_type="application/json",
        **(headers or {}),
    )


# --- Stripe ---


def test_stripe_signature_invalide_refusee(client):
    with patch(
        "stripe.Webhook.construct_event",
        side_effect=stripe.error.SignatureVerificationError("bad sig", "sig"),
    ):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {}, {"HTTP_STRIPE_SIGNATURE": "xxx"})

    assert resp.status_code == 400


def test_stripe_checkout_session_completed_confirme_le_paiement(client):
    cotisation = _cotisation_en_attente(mode_paiement="")
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(cotisation.id),
                "payment_intent": "pi_123",
                "id": "cs_123",
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.PAYEE
    assert cotisation.mode_paiement == ModePaiement.CARTE
    assert cotisation.reference_transaction == "STRIPE-pi_123"
    assert cotisation.date_paiement is not None


def test_stripe_checkout_session_completed_cree_une_notification_in_app(client):
    from apps.accounts.models import User
    from apps.membres.tests.factories import MembreFactory
    from apps.notifications.models import Notification, TypeNotification

    user = User.objects.create_user(
        email="stripe-payeur@example.de", password="Password123!", is_active=True
    )
    membre = MembreFactory(user=user)
    cotisation = _cotisation_en_attente(membre=membre, mode_paiement="")
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": str(cotisation.id),
                "payment_intent": "pi_456",
                "id": "cs_456",
            }
        },
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    notification = Notification.objects.get(destinataire=user)
    assert notification.type_notification == TypeNotification.PAIEMENT_CONFIRME


def test_stripe_rejeu_idempotent(client):
    cotisation = _cotisation_en_attente()
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": str(cotisation.id), "payment_intent": "pi_1"}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        _post_json(client, STRIPE_WEBHOOK_URL, {})
        _post_json(client, STRIPE_WEBHOOK_URL, {})

    cotisation.refresh_from_db()
    assert cotisation.reference_transaction == "STRIPE-pi_1"  # inchangé au second appel


def test_stripe_session_expiree_echoue_le_paiement(client):
    cotisation = _cotisation_en_attente()
    event = {
        "type": "checkout.session.expired",
        "data": {"object": {"client_reference_id": str(cotisation.id)}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.ECHOUEE


def test_stripe_session_expiree_ne_touche_pas_une_cotisation_deja_payee(client):
    cotisation = CotisationFactory(statut=StatutCotisation.PAYEE)
    event = {
        "type": "checkout.session.expired",
        "data": {"object": {"client_reference_id": str(cotisation.id)}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        _post_json(client, STRIPE_WEBHOOK_URL, {})

    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.PAYEE


def test_stripe_cotisation_introuvable_repond_200(client):
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
    assert Cotisation.objects.filter(statut=StatutCotisation.PAYEE).count() == 0


# --- PayPal ---


def test_paypal_signature_invalide_refusee(client):
    with patch("apps.cotisations.webhooks.verifier_signature_webhook_paypal", return_value=False):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, {"event_type": "PAYMENT.CAPTURE.COMPLETED"})

    assert resp.status_code == 400


def test_paypal_payload_invalide_refuse(client):
    resp = client.post(
        reverse(PAYPAL_WEBHOOK_URL), data=b"{not json", content_type="application/json"
    )
    assert resp.status_code == 400


def test_paypal_order_approved_capture_et_confirme(client):
    cotisation = _cotisation_en_attente(mode_paiement="")
    event = {
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {
            "id": "ORDER-1",
            "purchase_units": [{"custom_id": str(cotisation.id)}],
        },
    }
    capture_data = {
        "purchase_units": [{"payments": {"captures": [{"id": "CAPTURE-1"}]}}],
    }

    with patch("apps.cotisations.webhooks.verifier_signature_webhook_paypal", return_value=True):
        with patch("apps.cotisations.webhooks.capturer_commande_paypal", return_value=capture_data):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.PAYEE
    assert cotisation.mode_paiement == ModePaiement.PAYPAL
    assert cotisation.reference_transaction == "PAYPAL-CAPTURE-1"


def test_paypal_order_approved_capture_echouee_ne_modifie_rien(client):
    from apps.cotisations.gateways import GatewayError

    cotisation = _cotisation_en_attente()
    event = {
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {"id": "ORDER-1", "purchase_units": [{"custom_id": str(cotisation.id)}]},
    }

    with patch("apps.cotisations.webhooks.verifier_signature_webhook_paypal", return_value=True):
        with patch(
            "apps.cotisations.webhooks.capturer_commande_paypal",
            side_effect=GatewayError("échec"),
        ):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200  # on acquitte quand même — pas de retry PayPal infini
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.EN_ATTENTE


def test_paypal_payment_capture_completed_confirme(client):
    cotisation = _cotisation_en_attente(mode_paiement="")
    event = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": "CAPTURE-2", "custom_id": str(cotisation.id)},
    }

    with patch("apps.cotisations.webhooks.verifier_signature_webhook_paypal", return_value=True):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.PAYEE
    assert cotisation.reference_transaction == "PAYPAL-CAPTURE-2"


def test_paypal_payment_capture_denied_echoue(client):
    cotisation = _cotisation_en_attente()
    event = {
        "event_type": "PAYMENT.CAPTURE.DENIED",
        "resource": {"id": "CAPTURE-3", "custom_id": str(cotisation.id)},
    }

    with patch("apps.cotisations.webhooks.verifier_signature_webhook_paypal", return_value=True):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.ECHOUEE

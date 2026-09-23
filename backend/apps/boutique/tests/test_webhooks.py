"""
Tests — apps.boutique.webhooks (ajouté le 2026-09-17, même principe que
apps.cotisations.webhooks/AHM-46). Les vues sont de simples vues Django (pas DRF) : pas
d'authentification JWT, appelées ici via le client de test Django standard. La vérification de
signature elle-même (stripe.Webhook.construct_event / verifier_signature_webhook_paypal) est
mockée — elle est testée indépendamment dans apps.cotisations.tests.test_gateways.
"""

import json
from unittest.mock import patch

import pytest
import stripe
from django.urls import reverse

from apps.boutique.models import Commande, ModePaiementCommande, StatutBonAchat, StatutCommande
from apps.boutique.tests.factories import BonAchatFactory, CommandeFactory

pytestmark = pytest.mark.django_db

STRIPE_WEBHOOK_URL = "boutique:webhook-stripe"
PAYPAL_WEBHOOK_URL = "boutique:webhook-paypal"


def _commande_en_attente(**overrides):
    defaults = {"statut": StatutCommande.EN_ATTENTE}
    defaults.update(overrides)
    return CommandeFactory(**defaults)


def _bon_en_attente(**overrides):
    defaults = {"statut": StatutBonAchat.EN_ATTENTE}
    defaults.update(overrides)
    return BonAchatFactory(**defaults)


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


# --- BonAchat (préfixe "BON-", demande utilisateur du 2026-09-23 — voir _resoudre_reference) ---


def test_stripe_checkout_session_completed_confirme_un_bon_achat(client):
    bon = _bon_en_attente()
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": f"BON-{bon.id}",
                "payment_intent": "pi_bon_1",
                "id": "cs_bon_1",
            }
        },
    }

    with patch("apps.boutique.notifications.notifier_bon_achat_actif") as mock_notifier:
        with patch("stripe.Webhook.construct_event", return_value=event):
            resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.mode_paiement == ModePaiementCommande.EN_LIGNE
    assert bon.reference_paiement == "STRIPE-pi_bon_1"
    assert bon.date_paiement_confirme is not None
    assert bon.date_expiration is not None
    mock_notifier.assert_called_once_with(bon)
    # Ne doit pas avoir créé/modifié de Commande au passage.
    assert Commande.objects.count() == 0


def test_stripe_rejeu_idempotent_bon_achat(client):
    bon = _bon_en_attente()
    event = {
        "type": "checkout.session.completed",
        "data": {
            "object": {"client_reference_id": f"BON-{bon.id}", "payment_intent": "pi_bon_2"}
        },
    }

    with patch("apps.boutique.notifications.notifier_bon_achat_actif") as mock_notifier:
        with patch("stripe.Webhook.construct_event", return_value=event):
            _post_json(client, STRIPE_WEBHOOK_URL, {})
            _post_json(client, STRIPE_WEBHOOK_URL, {})

    bon.refresh_from_db()
    assert bon.reference_paiement == "STRIPE-pi_bon_2"  # inchangé au second appel
    mock_notifier.assert_called_once()  # pas de second email pour un bon déjà actif


def test_stripe_session_expiree_laisse_le_bon_en_attente(client):
    bon = _bon_en_attente()
    event = {
        "type": "checkout.session.expired",
        "data": {"object": {"client_reference_id": f"BON-{bon.id}"}},
    }

    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})

    assert resp.status_code == 200
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.EN_ATTENTE


def test_stripe_bon_introuvable_repond_200(client):
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"client_reference_id": "BON-00000000-0000-0000-0000-000000000000"}},
    }
    with patch("stripe.Webhook.construct_event", return_value=event):
        resp = _post_json(client, STRIPE_WEBHOOK_URL, {})
    assert resp.status_code == 200


def test_paypal_order_approved_capture_et_confirme_un_bon_achat(client):
    bon = _bon_en_attente()
    event = {
        "event_type": "CHECKOUT.ORDER.APPROVED",
        "resource": {
            "id": "ORDER-BON-1",
            "purchase_units": [{"custom_id": f"BON-{bon.id}"}],
        },
    }
    capture_data = {
        "purchase_units": [{"payments": {"captures": [{"id": "CAPTURE-BON-1"}]}}],
    }

    with patch("apps.boutique.notifications.notifier_bon_achat_actif") as mock_notifier:
        with patch(
            "apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True
        ):
            with patch(
                "apps.boutique.webhooks.capturer_commande_paypal", return_value=capture_data
            ):
                resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.reference_paiement == "PAYPAL-CAPTURE-BON-1"
    mock_notifier.assert_called_once_with(bon)


def test_paypal_payment_capture_completed_confirme_un_bon_achat(client):
    bon = _bon_en_attente()
    event = {
        "event_type": "PAYMENT.CAPTURE.COMPLETED",
        "resource": {"id": "CAPTURE-BON-2", "custom_id": f"BON-{bon.id}"},
    }

    with patch("apps.boutique.notifications.notifier_bon_achat_actif") as mock_notifier:
        with patch(
            "apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True
        ):
            resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.reference_paiement == "PAYPAL-CAPTURE-BON-2"
    mock_notifier.assert_called_once_with(bon)


def test_paypal_payment_capture_denied_laisse_le_bon_en_attente(client):
    bon = _bon_en_attente()
    event = {
        "event_type": "PAYMENT.CAPTURE.DENIED",
        "resource": {"id": "CAPTURE-BON-3", "custom_id": f"BON-{bon.id}"},
    }

    with patch("apps.boutique.webhooks.verifier_signature_webhook_paypal", return_value=True):
        resp = _post_json(client, PAYPAL_WEBHOOK_URL, event)

    assert resp.status_code == 200
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.EN_ATTENTE

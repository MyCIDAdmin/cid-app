"""
Tests — apps.cotisations.gateways (AHM-46). Aucun appel réseau réel : `stripe.checkout.Session.
create` et `requests.post` sont mockés, la session/le compte marchand n'existant pas encore
(l'utilisateur n'a pas de clés Stripe/PayPal sandbox au moment de l'implémentation).
"""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
import requests
import stripe

from apps.cotisations import gateways
from apps.cotisations.tests.factories import CotisationFactory

pytestmark = pytest.mark.django_db


def _cotisation():
    return CotisationFactory(
        libelle="Cotisation annuelle 2027",
        montant=Decimal("45.00"),
        statut="en_attente",
        reference_transaction=None,
    )


# --- creer_session_stripe ---


def test_creer_session_stripe_sans_cle_configuree(settings):
    settings.STRIPE_SECRET_KEY = ""
    with pytest.raises(gateways.GatewayError, match="STRIPE_SECRET_KEY"):
        gateways.creer_session_stripe(_cotisation())


def test_creer_session_stripe_retourne_url(settings):
    settings.STRIPE_SECRET_KEY = "sk_test_xxx"
    cotisation = _cotisation()
    session_factice = MagicMock(url="https://checkout.stripe.com/session/abc")

    with patch("stripe.checkout.Session.create", return_value=session_factice) as mock_create:
        url = gateways.creer_session_stripe(cotisation)

    assert url == "https://checkout.stripe.com/session/abc"
    kwargs = mock_create.call_args.kwargs
    assert kwargs["client_reference_id"] == str(cotisation.id)
    assert kwargs["line_items"][0]["price_data"]["unit_amount"] == 4500  # 45,00 € -> centimes


def test_creer_session_stripe_erreur_psp_devient_gateway_error(settings):
    settings.STRIPE_SECRET_KEY = "sk_test_xxx"
    with patch(
        "stripe.checkout.Session.create",
        side_effect=stripe.error.StripeError("carte refusée"),
    ):
        with pytest.raises(gateways.GatewayError):
            gateways.creer_session_stripe(_cotisation())


# --- _paypal_access_token ---


def test_paypal_access_token_sans_identifiants_configures(settings):
    settings.PAYPAL_CLIENT_ID = ""
    settings.PAYPAL_CLIENT_SECRET = ""
    with pytest.raises(gateways.GatewayError, match="PAYPAL_CLIENT_ID"):
        gateways._paypal_access_token()


def test_paypal_access_token_succes(settings):
    settings.PAYPAL_CLIENT_ID = "client-id"
    settings.PAYPAL_CLIENT_SECRET = "client-secret"
    reponse = MagicMock(status_code=200)
    reponse.json.return_value = {"access_token": "tok-123"}

    with patch("requests.post", return_value=reponse):
        token = gateways._paypal_access_token()

    assert token == "tok-123"


def test_paypal_access_token_echec_http(settings):
    settings.PAYPAL_CLIENT_ID = "client-id"
    settings.PAYPAL_CLIENT_SECRET = "client-secret"
    reponse = MagicMock(status_code=401)

    with patch("requests.post", return_value=reponse):
        with pytest.raises(gateways.GatewayError):
            gateways._paypal_access_token()


def test_paypal_access_token_erreur_reseau(settings):
    settings.PAYPAL_CLIENT_ID = "client-id"
    settings.PAYPAL_CLIENT_SECRET = "client-secret"

    with patch("requests.post", side_effect=requests.ConnectionError("timeout")):
        with pytest.raises(gateways.GatewayError):
            gateways._paypal_access_token()


# --- creer_commande_paypal ---


def test_creer_commande_paypal_retourne_lien_approbation(settings):
    settings.PAYPAL_CLIENT_ID = "client-id"
    settings.PAYPAL_CLIENT_SECRET = "client-secret"
    cotisation = _cotisation()
    reponse_commande = MagicMock(status_code=201)
    reponse_commande.json.return_value = {
        "id": "ORDER-1",
        "links": [
            {"rel": "self", "href": "https://api.sandbox.paypal.com/v2/checkout/orders/ORDER-1"},
            {"rel": "approve", "href": "https://sandbox.paypal.com/checkoutnow?token=ORDER-1"},
        ],
    }

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse_commande) as mock_post:
            url = gateways.creer_commande_paypal(cotisation)

    assert url == "https://sandbox.paypal.com/checkoutnow?token=ORDER-1"
    payload = mock_post.call_args.kwargs["json"]
    assert payload["purchase_units"][0]["custom_id"] == str(cotisation.id)
    assert payload["purchase_units"][0]["amount"]["value"] == "45.00"


def test_creer_commande_paypal_sans_lien_approbation(settings):
    reponse_commande = MagicMock(status_code=201)
    reponse_commande.json.return_value = {"id": "ORDER-1", "links": []}

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse_commande):
            with pytest.raises(gateways.GatewayError, match="lien d'approbation"):
                gateways.creer_commande_paypal(_cotisation())


def test_creer_commande_paypal_echec_http(settings):
    reponse_commande = MagicMock(status_code=400)
    reponse_commande.text = "invalid request"

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse_commande):
            with pytest.raises(gateways.GatewayError):
                gateways.creer_commande_paypal(_cotisation())


# --- capturer_commande_paypal ---


def test_capturer_commande_paypal_succes():
    reponse_capture = MagicMock(status_code=201)
    reponse_capture.json.return_value = {"id": "ORDER-1", "status": "COMPLETED"}

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse_capture):
            data = gateways.capturer_commande_paypal("ORDER-1")

    assert data["status"] == "COMPLETED"


def test_capturer_commande_paypal_echec():
    reponse_capture = MagicMock(status_code=422)

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse_capture):
            with pytest.raises(gateways.GatewayError):
                gateways.capturer_commande_paypal("ORDER-1")


# --- verifier_signature_webhook_paypal ---


def test_verifier_signature_sans_webhook_id_configure(settings):
    settings.PAYPAL_WEBHOOK_ID = ""
    assert gateways.verifier_signature_webhook_paypal({}, {"event_type": "X"}) is False


def test_verifier_signature_succes(settings):
    settings.PAYPAL_WEBHOOK_ID = "WH-123"
    reponse = MagicMock(status_code=200)
    reponse.json.return_value = {"verification_status": "SUCCESS"}

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse):
            assert gateways.verifier_signature_webhook_paypal({}, {"event_type": "X"}) is True


def test_verifier_signature_echec(settings):
    settings.PAYPAL_WEBHOOK_ID = "WH-123"
    reponse = MagicMock(status_code=200)
    reponse.json.return_value = {"verification_status": "FAILURE"}

    with patch.object(gateways, "_paypal_access_token", return_value="tok-123"):
        with patch("requests.post", return_value=reponse):
            assert gateways.verifier_signature_webhook_paypal({}, {"event_type": "X"}) is False

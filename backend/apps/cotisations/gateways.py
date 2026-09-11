"""
Clients passerelles de paiement (AHM-46) — Stripe Checkout et PayPal Checkout, tous deux en mode
hébergé (redirection vers une page payée entièrement par le PSP, puis retour vers l'app) :

  1. CotisationViewSet.initier_paiement_en_ligne (views.py) crée une session/commande via ce
     module et renvoie son URL de redirection au frontend.
  2. Le membre règle sur la page Stripe/PayPal — aucune donnée bancaire ne transite jamais par ce
     backend (scope PCI-DSS SAQ A pour Stripe ; PayPal héberge intégralement son propre
     formulaire).
  3. Le PSP notifie le backend de façon asynchrone via webhook (apps.cotisations.webhooks), qui
     fait passer la Cotisation de en_attente à payee/echouee — jamais le client (même principe
     que marquer_payee, AHM-53 : le statut final n'est jamais fait confiance au frontend).

Aucun SDK Python officiel de qualité équivalente à `stripe` n'existe pour les Checkout Orders v2
de PayPal (les anciens SDK `paypalrestsdk`/`paypal-checkout-serversdk` sont dépréciés côté
PayPal) : l'API REST elle-même est simple (OAuth2 client_credentials + 2 endpoints JSON), donc
implémentée directement via `requests` plutôt que d'ajouter une dépendance non maintenue.
"""

import logging

import requests
import stripe
from django.conf import settings

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_S = 10


class GatewayError(Exception):
    """
    Levée si la création (ou la capture) d'un paiement échoue côté PSP : clés absentes ou
    invalides, réseau, réponse inattendue. Ne fuite jamais de détail sensible — le message est
    conçu pour être affiché tel quel côté DF/Admin (jamais au membre, voir views.py).
    """


def creer_session_stripe(cotisation) -> str:
    """Crée une session Stripe Checkout pour `cotisation` et renvoie son URL de redirection."""
    if not settings.STRIPE_SECRET_KEY:
        raise GatewayError("Stripe n'est pas configuré (STRIPE_SECRET_KEY manquant).")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            client_reference_id=str(cotisation.id),
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": cotisation.libelle},
                        # Stripe attend un montant en centimes (plus petite unité monétaire).
                        "unit_amount": int(round(cotisation.montant * 100)),
                    },
                    "quantity": 1,
                }
            ],
            success_url=f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}",
            cancel_url=(
                f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}&annule=1"
            ),
        )
    except stripe.error.StripeError as exc:
        logger.warning("creer_session_stripe: échec pour cotisation=%s: %s", cotisation.id, exc)
        raise GatewayError(str(exc)) from exc
    return session.url


def _paypal_base_url() -> str:
    return (
        "https://api-m.paypal.com"
        if settings.PAYPAL_MODE == "live"
        else "https://api-m.sandbox.paypal.com"
    )


def _paypal_access_token() -> str:
    if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
        raise GatewayError("PayPal n'est pas configuré (PAYPAL_CLIENT_ID/SECRET manquant).")
    try:
        resp = requests.post(
            f"{_paypal_base_url()}/v1/oauth2/token",
            auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
            data={"grant_type": "client_credentials"},
            timeout=REQUEST_TIMEOUT_S,
        )
    except requests.RequestException as exc:
        raise GatewayError("Impossible de contacter PayPal (réseau).") from exc
    if resp.status_code != 200:
        raise GatewayError(f"Authentification PayPal échouée (HTTP {resp.status_code}).")
    return resp.json()["access_token"]


def creer_commande_paypal(cotisation) -> str:
    """Crée une commande PayPal (Orders v2, intent=CAPTURE) et renvoie son lien d'approbation."""
    token = _paypal_access_token()
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                # custom_id est répercuté par PayPal sur la ressource de capture (webhook) :
                # c'est ainsi que le webhook retrouve la Cotisation concernée.
                "custom_id": str(cotisation.id),
                "description": cotisation.libelle,
                "amount": {"currency_code": "EUR", "value": f"{cotisation.montant:.2f}"},
            }
        ],
        "application_context": {
            "return_url": (f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}"),
            "cancel_url": (
                f"{settings.FRONTEND_URL}/cotisation/retour?cotisation={cotisation.id}&annule=1"
            ),
            "user_action": "PAY_NOW",
        },
    }
    try:
        resp = requests.post(
            f"{_paypal_base_url()}/v2/checkout/orders",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_S,
        )
    except requests.RequestException as exc:
        raise GatewayError("Impossible de contacter PayPal (réseau).") from exc
    if resp.status_code not in (200, 201):
        logger.warning(
            "creer_commande_paypal: échec pour cotisation=%s: HTTP %s",
            cotisation.id,
            resp.status_code,
        )
        raise GatewayError(f"Création de la commande PayPal échouée (HTTP {resp.status_code}).")

    data = resp.json()
    for link in data.get("links", []):
        if link.get("rel") == "approve":
            return link["href"]
    raise GatewayError("Réponse PayPal inattendue : lien d'approbation manquant.")


def capturer_commande_paypal(order_id: str) -> dict:
    """Capture une commande PayPal approuvée par le payeur — appelée depuis le webhook."""
    token = _paypal_access_token()
    try:
        resp = requests.post(
            f"{_paypal_base_url()}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT_S,
        )
    except requests.RequestException as exc:
        raise GatewayError("Impossible de contacter PayPal (réseau).") from exc
    if resp.status_code not in (200, 201):
        raise GatewayError(f"Capture PayPal échouée (HTTP {resp.status_code}).")
    return resp.json()


def verifier_signature_webhook_paypal(headers, webhook_event: dict) -> bool:
    """
    Vérifie la signature d'un webhook PayPal via l'endpoint officiel
    /v1/notifications/verify-webhook-signature (PayPal ne signe pas ses webhooks par simple HMAC
    comme Stripe : la vérification passe par un appel API dédié).
    """
    if not settings.PAYPAL_WEBHOOK_ID:
        logger.warning("verifier_signature_webhook_paypal: PAYPAL_WEBHOOK_ID non configuré, rejet.")
        return False
    try:
        token = _paypal_access_token()
    except GatewayError:
        return False

    payload = {
        "transmission_id": headers.get("Paypal-Transmission-Id", ""),
        "transmission_time": headers.get("Paypal-Transmission-Time", ""),
        "cert_url": headers.get("Paypal-Cert-Url", ""),
        "auth_algo": headers.get("Paypal-Auth-Algo", ""),
        "transmission_sig": headers.get("Paypal-Transmission-Sig", ""),
        "webhook_id": settings.PAYPAL_WEBHOOK_ID,
        "webhook_event": webhook_event,
    }
    try:
        resp = requests.post(
            f"{_paypal_base_url()}/v1/notifications/verify-webhook-signature",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=REQUEST_TIMEOUT_S,
        )
    except requests.RequestException:
        return False
    return resp.status_code == 200 and resp.json().get("verification_status") == "SUCCESS"

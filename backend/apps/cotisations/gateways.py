"""
Clients passerelles de paiement (AHM-46, étendu au ticket boutique de 2026-09-17) — Stripe
Checkout et PayPal Checkout, tous deux en mode hébergé (redirection vers une page payée
entièrement par le PSP, puis retour vers l'app) :

  1. CotisationViewSet.initier_paiement_en_ligne (apps.cotisations.views) et
     CommandeViewSet.initier_paiement_en_ligne (apps.boutique.views) créent chacun une
     session/commande via ce module et renvoient son URL de redirection au frontend.
  2. Le membre règle sur la page Stripe/PayPal — aucune donnée bancaire ne transite jamais par ce
     backend (scope PCI-DSS SAQ A pour Stripe ; PayPal héberge intégralement son propre
     formulaire).
  3. Le PSP notifie le backend de façon asynchrone via webhook (apps.cotisations.webhooks et,
     depuis 2026-09-17, apps.boutique.webhooks), qui fait passer la Cotisation/Commande de
     en_attente à payee/confirmee — jamais le client (même principe que marquer_payee, AHM-53 :
     le statut final n'est jamais fait confiance au frontend).

Volontairement générique (paramètres scalaires — identifiant de référence/libellé/montant/URLs de
retour — plutôt qu'un objet Cotisation) depuis que ce module est partagé entre apps.cotisations et
apps.boutique : c'est le même compte marchand Stripe/PayPal (mêmes clés STRIPE_*/PAYPAL_* dans les
settings) qui règle les deux, seul l'objet métier derrière `reference_id` diffère. Toujours
implémenté physiquement dans apps.cotisations (premier module à en avoir eu besoin, AHM-46) plutôt
que déplacé vers une app "commune" séparée — ce dépôt a déjà plusieurs imports directs
inter-apps du même genre (ex. apps.stats/apps.membres important apps.cotisations.models).

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


def construire_evenement_stripe(payload: bytes, sig_header: str) -> stripe.Event:
    """Vérifie la signature d'un webhook Stripe et renvoie l'Event correspondant.

    STRIPE_WEBHOOK_SECRET peut contenir plusieurs secrets séparés par des virgules : Stripe
    attribue un signing secret distinct à chaque endpoint enregistré dans le Dashboard, or
    apps.cotisations.webhooks et apps.boutique.webhooks exposent chacun leur propre URL (donc leur
    propre endpoint côté Stripe) tout en partageant ce même compte marchand et ces mêmes settings
    Django. On essaie donc chaque secret jusqu'à ce qu'un signe correctement la requête, et on
    relève la dernière erreur si aucun ne correspond — même comportement/exception qu'un
    `stripe.Webhook.construct_event` direct du point de vue des appelants (StripeWebhookView).

    Si STRIPE_WEBHOOK_SECRET est vide (non configuré — ex. environnement de test), on retombe sur
    un unique essai avec la valeur brute (chaîne vide) plutôt que de lever immédiatement : ceci
    préserve le comportement historique d'un unique appel à `stripe.Webhook.construct_event`, dont
    dépendent les tests existants qui mockent directement cette fonction (sinon le mock ne serait
    jamais atteint et l'erreur de configuration masquerait l'échec de vérification attendu par le
    test)."""
    secrets = [s.strip() for s in settings.STRIPE_WEBHOOK_SECRET.split(",") if s.strip()]
    if not secrets:
        # Fail closed (2026-10-07, Sicherheitsprüfung) : ohne konfiguriertes Secret ließe sich ein
        # Webhook mit leerem HMAC-Schlüssel fälschen und Zahlungen gratis bestätigen.
        raise stripe.error.SignatureVerificationError(
            "STRIPE_WEBHOOK_SECRET ist nicht konfiguriert.", sig_header
        )
    derniere_erreur: stripe.error.SignatureVerificationError
    for secret in secrets:
        try:
            return stripe.Webhook.construct_event(payload, sig_header, secret)
        except stripe.error.SignatureVerificationError as exc:
            derniere_erreur = exc
    raise derniere_erreur


def creer_session_stripe(
    reference_id: str, libelle: str, montant, success_url: str, cancel_url: str
) -> str:
    """Crée une session Stripe Checkout et renvoie son URL de redirection.

    `reference_id` est l'identifiant (UUID) de l'objet métier (Cotisation ou Commande) — il
    revient tel quel dans `client_reference_id` sur chaque événement webhook, c'est ainsi que
    StripeWebhookView (cotisations ou boutique) retrouve l'objet concerné."""
    if not settings.STRIPE_SECRET_KEY:
        raise GatewayError("Stripe n'est pas configuré (STRIPE_SECRET_KEY manquant).")
    stripe.api_key = settings.STRIPE_SECRET_KEY
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            client_reference_id=str(reference_id),
            line_items=[
                {
                    "price_data": {
                        "currency": "eur",
                        "product_data": {"name": libelle},
                        # Stripe attend un montant en centimes (plus petite unité monétaire).
                        "unit_amount": int(round(montant * 100)),
                    },
                    "quantity": 1,
                }
            ],
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except stripe.error.StripeError as exc:
        logger.warning("creer_session_stripe: échec pour reference_id=%s: %s", reference_id, exc)
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


def creer_commande_paypal(
    reference_id: str, libelle: str, montant, success_url: str, cancel_url: str
) -> str:
    """Crée une commande PayPal (Orders v2, intent=CAPTURE) et renvoie son lien d'approbation.

    `reference_id` est répercuté par PayPal sur la ressource de capture (webhook) en tant que
    `custom_id` — c'est ainsi que PayPalWebhookView (cotisations ou boutique) retrouve l'objet
    métier (Cotisation ou Commande) concerné."""
    token = _paypal_access_token()
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "custom_id": str(reference_id),
                "description": libelle,
                "amount": {"currency_code": "EUR", "value": f"{montant:.2f}"},
            }
        ],
        "application_context": {
            "return_url": success_url,
            "cancel_url": cancel_url,
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
            "creer_commande_paypal: échec pour reference_id=%s: HTTP %s",
            reference_id,
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

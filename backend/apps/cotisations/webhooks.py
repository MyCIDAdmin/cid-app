"""
Webhooks passerelles de paiement (AHM-46) — voir docstring de apps.cotisations.gateways pour le
flux complet. Ce sont des vues Django "brutes" (pas DRF) : elles reçoivent un appel serveur à
serveur du PSP, sans authentification JWT ni cookie de session, et doivent lire le corps brut de
la requête (nécessaire à la vérification de signature Stripe) — un ViewSet DRF classique
parserait le JSON avant qu'on puisse y accéder tel quel.

Sécurité (SCD) : toute notification dont la signature ne peut pas être vérifiée est rejetée
(HTTP 400) et journalisée — jamais de confiance aveugle dans le contenu d'un webhook, qui est un
endpoint public par nature. Idempotent : `_confirmer_paiement_gateway` ne modifie une Cotisation
que si elle est encore en_attente/echouee (une notification rejouée par le PSP, ou reçue deux
fois, ne fait rien la deuxième fois).
"""

import json
import logging

import stripe
from django.http import HttpResponse, HttpResponseBadRequest
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from .gateways import (
    GatewayError,
    capturer_commande_paypal,
    construire_evenement_stripe,
    verifier_signature_webhook_paypal,
)
from .models import Cotisation, ModePaiement, StatutCotisation
from .notifications import notifier_paiement_confirme

logger = logging.getLogger(__name__)

# Mêmes statuts que STATUTS_CONFIRMABLES_EN_PAYEE (views.py, marquer_payee/AHM-53) : un paiement
# gateway ne réécrit jamais une cotisation déjà payée/remboursée/annulée — idempotence webhook.
STATUTS_CONFIRMABLES = {StatutCotisation.EN_ATTENTE, StatutCotisation.ECHOUEE}


def _confirmer_paiement_gateway(cotisation: Cotisation, mode_paiement: str, reference: str) -> None:
    if cotisation.statut not in STATUTS_CONFIRMABLES:
        return  # idempotence : déjà traité (rejeu webhook, double notification...)
    cotisation.mode_paiement = mode_paiement
    # Fixé explicitement : Cotisation.save() ne génère une référence/date que si
    # reference_transaction est vide au moment de l'appel (voir models.py) — ici on impose la
    # référence externe du PSP, donc on doit aussi fixer date_paiement nous-mêmes.
    cotisation.reference_transaction = reference
    cotisation.date_paiement = timezone.now()
    cotisation.statut = StatutCotisation.PAYEE
    cotisation.save()
    notifier_paiement_confirme(cotisation)


def _echouer_paiement_gateway(cotisation: Cotisation) -> None:
    if cotisation.statut != StatutCotisation.EN_ATTENTE:
        return
    cotisation.statut = StatutCotisation.ECHOUEE
    cotisation.save()


def _cotisation_ou_none(cotisation_id):
    if not cotisation_id:
        return None
    try:
        return Cotisation.objects.get(id=cotisation_id)
    except (Cotisation.DoesNotExist, ValueError):
        return None


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    """POST /cotisations/webhooks/stripe/ — événements Stripe Checkout."""

    def post(self, request, *args, **kwargs):
        sig_header = request.headers.get("Stripe-Signature", "")
        try:
            event = construire_evenement_stripe(request.body, sig_header)
        except (ValueError, stripe.error.SignatureVerificationError) as exc:
            logger.warning("StripeWebhookView: signature invalide (%s)", exc)
            return HttpResponseBadRequest("signature invalide")

        type_ = event["type"]
        session = event["data"]["object"]
        cotisation = _cotisation_ou_none(session.get("client_reference_id"))
        if cotisation is None:
            # Événement non pertinent (autre session, ou Cotisation supprimée entre-temps) : on
            # répond 200 pour que Stripe ne rejoue pas indéfiniment un événement qu'on ignore.
            return HttpResponse(status=200)

        if type_ in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            reference = session.get("payment_intent") or session.get("id")
            _confirmer_paiement_gateway(cotisation, ModePaiement.CARTE, f"STRIPE-{reference}")
        elif type_ in ("checkout.session.expired", "checkout.session.async_payment_failed"):
            _echouer_paiement_gateway(cotisation)

        return HttpResponse(status=200)


@method_decorator(csrf_exempt, name="dispatch")
class PayPalWebhookView(View):
    """POST /cotisations/webhooks/paypal/ — événements PayPal Checkout Orders v2."""

    def post(self, request, *args, **kwargs):
        try:
            event = json.loads(request.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return HttpResponseBadRequest("payload invalide")

        if not verifier_signature_webhook_paypal(request.headers, event):
            logger.warning("PayPalWebhookView: signature invalide")
            return HttpResponseBadRequest("signature invalide")

        type_ = event.get("event_type")
        resource = event.get("resource", {})

        if type_ == "CHECKOUT.ORDER.APPROVED":
            self._capturer_et_confirmer(resource)
        elif type_ == "PAYMENT.CAPTURE.COMPLETED":
            cotisation = _cotisation_ou_none(resource.get("custom_id"))
            if cotisation is not None:
                _confirmer_paiement_gateway(
                    cotisation, ModePaiement.PAYPAL, f"PAYPAL-{resource.get('id')}"
                )
        elif type_ == "PAYMENT.CAPTURE.DENIED":
            cotisation = _cotisation_ou_none(resource.get("custom_id"))
            if cotisation is not None:
                _echouer_paiement_gateway(cotisation)

        return HttpResponse(status=200)

    def _capturer_et_confirmer(self, resource: dict) -> None:
        order_id = resource.get("id")
        purchase_units = resource.get("purchase_units", [])
        custom_id = purchase_units[0].get("custom_id") if purchase_units else None
        cotisation = _cotisation_ou_none(custom_id)
        if not order_id or cotisation is None:
            return
        try:
            capture_data = capturer_commande_paypal(order_id)
        except GatewayError as exc:
            logger.warning(
                "PayPalWebhookView: capture échouée order=%s cotisation=%s: %s",
                order_id,
                cotisation.id,
                exc,
            )
            return
        captures = (
            capture_data.get("purchase_units", [{}])[0].get("payments", {}).get("captures", [])
        )
        capture_id = captures[0]["id"] if captures else order_id
        _confirmer_paiement_gateway(cotisation, ModePaiement.PAYPAL, f"PAYPAL-{capture_id}")

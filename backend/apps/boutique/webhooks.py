"""
Webhooks passerelles de paiement — app boutique (ajouté le 2026-09-17, même principe que
apps.cotisations.webhooks/AHM-46 ; voir docstring de apps.cotisations.gateways pour le flux
complet et pourquoi ce module partage son code PSP avec apps.cotisations).

Ce sont des vues Django "brutes" (pas DRF) : elles reçoivent un appel serveur à serveur du PSP,
sans authentification JWT ni cookie de session, et doivent lire le corps brut de la requête
(nécessaire à la vérification de signature Stripe) — un ViewSet DRF classique parserait le JSON
avant qu'on puisse y accéder tel quel.

Sécurité (SCD) : toute notification dont la signature ne peut pas être vérifiée est rejetée
(HTTP 400) et journalisée — jamais de confiance aveugle dans le contenu d'un webhook, qui est un
endpoint public par nature. Idempotent : `_confirmer_paiement_gateway` ne modifie une Commande
que si elle est encore en_attente (une notification rejouée par le PSP, ou reçue deux fois, ne
fait rien la deuxième fois).

Contrairement à Cotisation, Commande n'a pas de statut "échouée" dans sa machine à états (voir
STATUTS_CONFIRMABLES_PAIEMENT côté models.py) : un paiement expiré/refusé laisse donc simplement
la commande en_attente (le membre peut réessayer depuis la page de retour, ou payer par
virement/espèces confirmé manuellement) — pas de transition à effectuer, juste une trace dans les
logs. Même chose pour BonAchat (STATUTS_BON_ACHAT_CONFIRMABLES) depuis le 2026-09-23.

Résolution de la référence (`client_reference_id`/`custom_id`, voir _resoudre_reference) : une
Commande et un BonAchat partagent le même compte marchand Stripe/PayPal, donc le même espace de
webhooks. Plutôt que de risquer une collision d'UUID entre les deux tables (extrêmement
improbable mais jamais formellement exclue), CommandeViewSet.initier_paiement_en_ligne envoie
l'UUID brut de la Commande (comportement historique, inchangé) tandis que
BonAchatViewSet.initier_paiement_en_ligne préfixe la référence par "BON-" — cette dernière est
donc résolue en priorité, sans même toucher la table Commande.
"""

import json
import logging

import stripe
from django.http import HttpResponse, HttpResponseBadRequest
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.cotisations.gateways import (
    GatewayError,
    capturer_commande_paypal,
    construire_evenement_stripe,
    verifier_signature_webhook_paypal,
)

from .models import (
    STATUTS_BON_ACHAT_CONFIRMABLES,
    STATUTS_CONFIRMABLES_PAIEMENT,
    BonAchat,
    Commande,
    ModePaiementCommande,
    StatutCommande,
)

logger = logging.getLogger(__name__)

_PREFIXE_BON_ACHAT = "BON-"


def _confirmer_paiement_gateway(commande: Commande, reference: str) -> None:
    if commande.statut not in STATUTS_CONFIRMABLES_PAIEMENT:
        return  # idempotence : déjà traité (rejeu webhook, double notification...)
    commande.mode_paiement = ModePaiementCommande.EN_LIGNE
    commande.reference_paiement = reference
    commande.date_paiement_confirme = timezone.now()
    # paiement_confirme_par reste vide : c'est le PSP qui confirme, pas un membre du staff — voir
    # docstring du champ dans models.py.
    commande.statut = StatutCommande.CONFIRMEE
    commande.save(
        update_fields=[
            "mode_paiement",
            "reference_paiement",
            "date_paiement_confirme",
            "statut",
        ]
    )
    # Volontairement aucune notification ici, comme pour une confirmation manuelle via
    # confirmer_paiement (voir docstring de apps.boutique.views) — comportement identique quel
    # que soit le chemin de confirmation.


def _confirmer_paiement_bon_achat(bon: BonAchat, reference: str) -> None:
    """Ajouté le 2026-09-23 — même principe d'idempotence que _confirmer_paiement_gateway, mais
    déclenche en plus l'email/notification "bon prêt à l'emploi" (contrairement à une Commande,
    voir apps.boutique.notifications.notifier_bon_achat_actif) : un BonAchat n'a aucune autre
    notification à ce stade (pas d'équivalent "nouvelle commande" côté staff)."""
    if bon.statut not in STATUTS_BON_ACHAT_CONFIRMABLES:
        return  # idempotence : déjà traité (rejeu webhook, double notification...)
    bon.mode_paiement = ModePaiementCommande.EN_LIGNE
    bon.reference_paiement = reference
    bon.activer()
    bon.save(
        update_fields=[
            "mode_paiement",
            "reference_paiement",
            "statut",
            "date_paiement_confirme",
            "date_expiration",
        ]
    )
    # Import différé — évite tout risque de dépendance circulaire au chargement de l'app, voir
    # apps.boutique.tasks.envoyer_email_bon_achat_code pour la même convention.
    from .notifications import notifier_bon_achat_actif

    notifier_bon_achat_actif(bon)


def _echouer_paiement(objet) -> None:
    # Pas de statut "échouée" côté Commande/BonAchat (voir docstring module) : rien à faire,
    # seulement une trace pour le suivi/debug.
    logger.info(
        "boutique webhook: paiement échoué/expiré pour %s=%s", type(objet).__name__, objet.id
    )


def _resoudre_reference(reference_id):
    """Résout un `client_reference_id`/`custom_id` PSP vers ("commande", Commande),
    ("bon", BonAchat), ou (None, None) si introuvable/non pertinent pour cette app (voir
    docstring de module) — remplace l'ancien `_commande_ou_none`, désormais insuffisant depuis
    l'ajout de BonAchat."""
    if not reference_id:
        return None, None
    if reference_id.startswith(_PREFIXE_BON_ACHAT):
        try:
            return "bon", BonAchat.objects.get(id=reference_id[len(_PREFIXE_BON_ACHAT) :])
        except (BonAchat.DoesNotExist, ValueError):
            return None, None
    try:
        return "commande", Commande.objects.get(id=reference_id)
    except (Commande.DoesNotExist, ValueError):
        return None, None


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    """POST /boutique/webhooks/stripe/ — événements Stripe Checkout."""

    def post(self, request, *args, **kwargs):
        sig_header = request.headers.get("Stripe-Signature", "")
        try:
            event = construire_evenement_stripe(request.body, sig_header)
        except (ValueError, stripe.error.SignatureVerificationError) as exc:
            logger.warning("StripeWebhookView (boutique): signature invalide (%s)", exc)
            return HttpResponseBadRequest("signature invalide")

        type_ = event["type"]
        session = event["data"]["object"]
        type_objet, objet = _resoudre_reference(session.get("client_reference_id"))
        if objet is None:
            # Événement non pertinent pour cette app (ex. une session Cotisation, qui partage le
            # même compte Stripe — voir apps.cotisations.webhooks) : on répond 200 pour que
            # Stripe ne rejoue pas indéfiniment un événement qu'on ignore ici.
            return HttpResponse(status=200)

        if type_ in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            reference = session.get("payment_intent") or session.get("id")
            if type_objet == "bon":
                _confirmer_paiement_bon_achat(objet, f"STRIPE-{reference}")
            else:
                _confirmer_paiement_gateway(objet, f"STRIPE-{reference}")
        elif type_ in ("checkout.session.expired", "checkout.session.async_payment_failed"):
            _echouer_paiement(objet)

        return HttpResponse(status=200)


@method_decorator(csrf_exempt, name="dispatch")
class PayPalWebhookView(View):
    """POST /boutique/webhooks/paypal/ — événements PayPal Checkout Orders v2."""

    def post(self, request, *args, **kwargs):
        try:
            event = json.loads(request.body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return HttpResponseBadRequest("payload invalide")

        if not verifier_signature_webhook_paypal(request.headers, event):
            logger.warning("PayPalWebhookView (boutique): signature invalide")
            return HttpResponseBadRequest("signature invalide")

        type_ = event.get("event_type")
        resource = event.get("resource", {})

        if type_ == "CHECKOUT.ORDER.APPROVED":
            self._capturer_et_confirmer(resource)
        elif type_ == "PAYMENT.CAPTURE.COMPLETED":
            type_objet, objet = _resoudre_reference(resource.get("custom_id"))
            if type_objet == "bon":
                _confirmer_paiement_bon_achat(objet, f"PAYPAL-{resource.get('id')}")
            elif type_objet == "commande":
                _confirmer_paiement_gateway(objet, f"PAYPAL-{resource.get('id')}")
        elif type_ == "PAYMENT.CAPTURE.DENIED":
            _type_objet, objet = _resoudre_reference(resource.get("custom_id"))
            if objet is not None:
                _echouer_paiement(objet)

        return HttpResponse(status=200)

    def _capturer_et_confirmer(self, resource: dict) -> None:
        order_id = resource.get("id")
        purchase_units = resource.get("purchase_units", [])
        custom_id = purchase_units[0].get("custom_id") if purchase_units else None
        type_objet, objet = _resoudre_reference(custom_id)
        if not order_id or objet is None:
            return
        try:
            capture_data = capturer_commande_paypal(order_id)
        except GatewayError as exc:
            logger.warning(
                "PayPalWebhookView (boutique): capture échouée order=%s %s=%s: %s",
                order_id,
                type_objet,
                objet.id,
                exc,
            )
            return
        captures = (
            capture_data.get("purchase_units", [{}])[0].get("payments", {}).get("captures", [])
        )
        capture_id = captures[0]["id"] if captures else order_id
        if type_objet == "bon":
            _confirmer_paiement_bon_achat(objet, f"PAYPAL-{capture_id}")
        else:
            _confirmer_paiement_gateway(objet, f"PAYPAL-{capture_id}")

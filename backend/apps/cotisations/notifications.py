"""
Point d'intégration `apps.notifications` pour ce module (Phase 2B) — voir
apps.notifications.services.notifier pour la convention générale.

Regroupé ici plutôt que dupliqué dans views.py/webhooks.py/tasks.py : ce sont les 3 points d'entrée
qui font passer une Cotisation à `payee` (marquer_payee, le webhook Stripe/PayPal, et — pour la
relance — aucune transition de statut mais un rappel périodique), et tous les 3 doivent déclencher
la même notification "paiement confirmé"/"relance cotisation" (RICEFW W-001/W-002).
"""

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import Cotisation


def notifier_paiement_confirme(cotisation: Cotisation) -> None:
    """W-002 étape 4 — appelé juste après que `cotisation.statut` soit passé à `payee` (par
    marquer_payee ou par le webhook PSP), en plus de l'email/reçu déjà envoyé par ces mêmes
    points d'entrée."""
    user = getattr(cotisation.membre, "user", None)
    notifier(
        user,
        TypeNotification.PAIEMENT_CONFIRME,
        titre="Paiement confirmé",
        message=f"Votre cotisation {cotisation.annee} a bien été enregistrée comme payée.",
        lien="/cotisations",
    )


def notifier_relance_cotisation(membre, annee: int, checkpoint: str) -> None:
    """W-001 étape 5 — appelé pour chaque membre relancé par
    `apps.cotisations.tasks._envoyer_relances_pour`, en plus de l'email de relance."""
    user = getattr(membre, "user", None)
    notifier(
        user,
        TypeNotification.RELANCE_COTISATION,
        titre=f"Rappel — cotisation {annee}",
        message=f"Votre cotisation {annee} n'est pas encore réglée.",
        lien="/cotisations",
    )

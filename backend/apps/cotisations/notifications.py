"""
Point d'intégration `apps.notifications` pour ce module (Phase 2B) — voir
apps.notifications.services.notifier pour la convention générale.

Regroupé ici plutôt que dupliqué dans views.py/webhooks.py/tasks.py : ce sont les 3 points d'entrée
qui font passer une Cotisation à `payee` (marquer_payee, le webhook Stripe/PayPal, et — pour la
relance — aucune transition de statut mais un rappel périodique), et tous les 3 doivent déclencher
la même notification "paiement confirmé"/"relance cotisation" (RICEFW W-001/W-002).
"""

from apps.accounts.models import ROLE_LEVELS, Role
from apps.accounts.services import users_role_at_least
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import Cotisation

STAFF_PAIEMENT_ATTENTE_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]


def notifier_nouveau_paiement_attente_staff(cotisation: Cotisation) -> None:
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — appelée
    par `CotisationViewSet.perform_create`, uniquement pour la branche libre-service (un membre
    déclare son propre paiement, qui reste `en_attente` jusqu'à confirmation manuelle, voir
    AHM-53/`/cotisations/en-attente`) : quand c'est le Directeur Financier qui saisit lui-même
    une transaction pour un autre membre, il n'y a personne à notifier de sa propre action.
    Diffusée à tout Directeur Financier+, sans email (file d'attente partagée)."""
    titre = "Nouveau paiement en attente de confirmation"
    message = f"{cotisation.membre} a déclaré un paiement de cotisation {cotisation.annee}."
    for destinataire in users_role_at_least(STAFF_PAIEMENT_ATTENTE_MIN_LEVEL):
        notifier(
            destinataire,
            TypeNotification.COTISATION_PAIEMENT_ATTENTE,
            titre=titre,
            message=message,
            lien="/cotisations/en-attente",
        )


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

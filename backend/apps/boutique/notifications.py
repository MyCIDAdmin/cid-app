"""Point d'intégration `apps.notifications` pour ce module (Phase 2B) — voir
apps.notifications.services.notifier pour la convention générale et apps.cotisations.notifications
pour le même principe appliqué aux cotisations."""

from django.conf import settings
from django.core.mail import send_mail

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import Commande


def _destinataire(commande: Commande):
    return getattr(commande.membre, "user", None)


def notifier_commande_confirmee(commande: Commande) -> None:
    """Appelée juste après la création réussie d'une commande (`CommandeViewSet.passer`)."""
    user = _destinataire(commande)
    if user and user.email:
        send_mail(
            subject=f"Commande {commande.numero_commande} confirmée",
            message=(
                f"Votre commande {commande.numero_commande} d'un montant de "
                f"{commande.montant_total} € a bien été enregistrée."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    notifier(
        user,
        TypeNotification.BOUTIQUE_COMMANDE_CONFIRMEE,
        titre=f"Commande {commande.numero_commande} confirmée",
        message=f"Votre commande d'un montant de {commande.montant_total} € a été enregistrée.",
        lien="/boutique/commandes",
    )


def notifier_commande_expediee(commande: Commande) -> None:
    """Appelée quand `CommandeViewSet.changer_statut` fait passer une commande à `expediee`."""
    user = _destinataire(commande)
    if user and user.email:
        send_mail(
            subject=f"Commande {commande.numero_commande} expédiée",
            message=f"Votre commande {commande.numero_commande} vient d'être expédiée.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    notifier(
        user,
        TypeNotification.BOUTIQUE_COMMANDE_EXPEDIEE,
        titre=f"Commande {commande.numero_commande} expédiée",
        message="Votre commande vient d'être expédiée.",
        lien="/boutique/commandes",
    )

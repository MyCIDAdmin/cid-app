"""Point d'intégration `apps.notifications` pour ce module (Phase 2B) — voir
apps.notifications.services.notifier pour la convention générale et apps.cotisations.notifications
pour le même principe appliqué aux cotisations."""

from django.conf import settings
from django.core.mail import send_mail

from apps.accounts.models import ROLE_LEVELS, Role
from apps.accounts.services import users_role_at_least
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import Commande

STAFF_NOUVELLE_COMMANDE_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]


def _destinataire(commande: Commande):
    return getattr(commande.membre, "user", None)


def notifier_nouvelle_commande_staff(commande: Commande) -> None:
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — appelée
    juste après `notifier_commande_confirmee` par `CommandeViewSet.passer`. Diffusée à tout
    Bureau Admin+ (même niveau que `ORDER_VISIBILITY_MIN_LEVEL`, voir permissions.py), sans
    email (file de gestion partagée, pas de destinataire individuel)."""
    titre = f"Nouvelle commande {commande.numero_commande}"
    message = f"{commande.membre} a passé une commande de {commande.montant_total} €."
    for destinataire in users_role_at_least(STAFF_NOUVELLE_COMMANDE_MIN_LEVEL):
        notifier(
            destinataire,
            TypeNotification.BOUTIQUE_NOUVELLE_COMMANDE,
            titre=titre,
            message=message,
            lien="/admin/boutique",
        )


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


def notifier_commande_annulee(commande: Commande) -> None:
    """Appelée juste après qu'une commande soit passée à `annulee` (`CommandeViewSet.annuler` ou
    `changer_statut`), ajouté le 2026-09-16 — uniquement quand ce n'est pas le client lui-même qui
    vient d'annuler sa propre commande (voir views.py, même principe que
    apps.adhesions.notifications.notifier_souscription_annulee)."""
    user = _destinataire(commande)
    if user and user.email:
        send_mail(
            subject=f"Commande {commande.numero_commande} annulée",
            message=f"Votre commande {commande.numero_commande} a été annulée.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    notifier(
        user,
        TypeNotification.BOUTIQUE_COMMANDE_ANNULEE,
        titre=f"Commande {commande.numero_commande} annulée",
        message=f"Votre commande {commande.numero_commande} a été annulée.",
        lien="/boutique/commandes",
    )


def notifier_commande_expediee(commande: Commande) -> None:
    """Appelée quand `CommandeViewSet.expedier` fait passer une commande à `expediee` (flux
    normal ou nacherfassement) — voir views.py. Inclut le numéro de suivi/transporteur dans
    l'email quand ils sont renseignés (demande utilisateur du 2026-09-15 : "Versandbestätigung
    per Mail")."""
    user = _destinataire(commande)
    if commande.numero_suivi:
        suivi = (
            f" Numéro de suivi : {commande.numero_suivi}"
            + (f" ({commande.transporteur})" if commande.transporteur else "")
            + "."
        )
    else:
        suivi = ""
    if user and user.email:
        send_mail(
            subject=f"Commande {commande.numero_commande} expédiée",
            message=f"Votre commande {commande.numero_commande} vient d'être expédiée.{suivi}",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    notifier(
        user,
        TypeNotification.BOUTIQUE_COMMANDE_EXPEDIEE,
        titre=f"Commande {commande.numero_commande} expédiée",
        message=f"Votre commande vient d'être expédiée.{suivi}",
        lien="/boutique/commandes",
    )

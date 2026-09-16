"""
Point d'intégration `apps.notifications` pour ce module (ajouté le 2026-09-16, demande
utilisateur : "Baue notification wo du siehst, dass es Sinn macht") — voir
apps.notifications.services.notifier pour la convention générale et apps.boutique.notifications
pour le même principe (email + in-app dans la même fonction, appelée juste après la transition de
statut concernée).

`envoyer_annonce_campagne` (broadcast à tous les membres actifs) reste dans tasks.py (Celery),
comme apps.evenements — les 3 fonctions ci-dessous notifient un seul membre à la fois, en réaction
directe à une action RH+/membre, donc restent synchrones (pas de tâche Celery à part entière).
"""

from django.conf import settings
from django.core.mail import send_mail

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

LIEN_MON_ADHESION = "/mon-adhesion"


def _envoyer_email(user, subject: str, message: str) -> None:
    if not user or not user.email:
        return
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )


def notifier_justificatif_valide(justificatif) -> None:
    """Appelée par `JustificatifRabaisViewSet.valider` quand la décision RH+ est "approuve"."""
    souscription = justificatif.souscription
    user = getattr(souscription.membre, "user", None)
    _envoyer_email(
        user,
        subject="Justificatif validé",
        message=(
            f"Votre justificatif de rabais pour {souscription.campagne.nom} a été validé. "
            "Vous pouvez procéder au paiement."
        ),
    )
    notifier(
        user,
        TypeNotification.ADHESION_JUSTIFICATIF_VALIDE,
        titre="Justificatif validé",
        message=f"Votre justificatif de rabais pour {souscription.campagne.nom} a été validé.",
        lien=LIEN_MON_ADHESION,
    )


def notifier_justificatif_refuse(justificatif) -> None:
    """Appelée par `JustificatifRabaisViewSet.valider` quand la décision RH+ est "rejete"."""
    souscription = justificatif.souscription
    user = getattr(souscription.membre, "user", None)
    motif = f" Motif : {justificatif.motif_rejet}" if justificatif.motif_rejet else ""
    _envoyer_email(
        user,
        subject="Justificatif refusé",
        message=(
            f"Votre justificatif de rabais pour {souscription.campagne.nom} a été refusé.{motif} "
            "Vous pouvez souscrire au prix plein ou annuler votre souscription."
        ),
    )
    notifier(
        user,
        TypeNotification.ADHESION_JUSTIFICATIF_REFUSE,
        titre="Justificatif refusé",
        message=(
            f"Votre justificatif de rabais pour {souscription.campagne.nom} a été refusé.{motif}"
        ),
        lien=LIEN_MON_ADHESION,
    )


def notifier_souscription_annulee(souscription) -> None:
    """Appelée par `SouscriptionViewSet.annuler` uniquement quand l'annulation est faite par
    quelqu'un d'autre que le membre propriétaire (RH+/Bureau Admin — "stornieren", demande
    utilisateur du 2026-09-16) : un membre qui annule lui-même sa propre souscription
    ("zurückziehen") n'a pas besoin d'être informé de sa propre action, voir views.py."""
    user = getattr(souscription.membre, "user", None)
    _envoyer_email(
        user,
        subject="Souscription annulée",
        message=f"Votre souscription à {souscription.campagne.nom} a été annulée.",
    )
    notifier(
        user,
        TypeNotification.ADHESION_SOUSCRIPTION_ANNULEE,
        titre="Souscription annulée",
        message=f"Votre souscription à {souscription.campagne.nom} a été annulée.",
        lien=LIEN_MON_ADHESION,
    )

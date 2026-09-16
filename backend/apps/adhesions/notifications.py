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

from apps.accounts.models import ROLE_LEVELS, Role
from apps.accounts.services import users_role_at_least
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

LIEN_MON_ADHESION = "/mon-adhesion"
LIEN_ADMIN_JUSTIFICATIFS = "/admin/justificatifs"
STAFF_JUSTIFICATIFS_MIN_LEVEL = ROLE_LEVELS[Role.RH]


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


def notifier_nouveau_justificatif_staff(justificatif) -> None:
    """Appelée par `JustificatifRabaisViewSet.create` — uniquement quand c'est le membre
    lui-même qui vient de soumettre son justificatif (jamais quand c'est RH+ qui l'a
    uploadé pour le compte d'un membre, voir views.py : inutile de notifier RH de sa propre
    action, même principe que l'annulation par RH d'une souscription/commande). Diffusée à
    tout RH+ (pas de destinataire unique — c'est une file d'attente partagée, pas un
    justificatif assigné à une personne)."""
    souscription = justificatif.souscription
    membre = souscription.membre
    titre = "Nouveau justificatif à valider"
    message = f"{membre} a soumis un justificatif pour {souscription.campagne.nom}."
    for user in users_role_at_least(STAFF_JUSTIFICATIFS_MIN_LEVEL):
        notifier(
            user,
            TypeNotification.ADHESION_JUSTIFICATIF_SOUMIS,
            titre=titre,
            message=message,
            lien=LIEN_ADMIN_JUSTIFICATIFS,
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

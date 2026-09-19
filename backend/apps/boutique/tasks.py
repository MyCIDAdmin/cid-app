"""
Tâches Celery — app boutique (ajouté le 2026-09-19, correctif : les emails de commande étaient
jusqu'ici envoyés de façon SYNCHRONE depuis apps.boutique.notifications, appelée directement
dans le corps de la requête HTTP (CommandeViewSet.passer/annuler/changer_statut/expedier) —
contrairement à toutes les autres apps du projet (accounts, cotisations, adhesions, evenements,
communaute, vote), qui envoient systématiquement leurs emails via une tâche Celery (`.delay()`),
jamais en ligne dans la vue. Cette incohérence n'avait pas d'impact tant que SMTP n'était pas
configuré (échec quasi instantané, `fail_silently=True` l'avalait) : une fois de vraies
identifiants SMTP renseignés (Brevo), une requête `passer()` s'est mise à bloquer plusieurs
dizaines de secondes — le bouton "Confirmer la commande" restait bloqué côté membre — le temps
que la tentative de connexion SMTP échoue (Railway bloque le SMTP sortant sur les plans
Free/Trial/Hobby, voir docs/RAILWAY.md et Hosting_Migration_Vorschlag.md : la connexion reste
en attente au lieu d'être immédiatement refusée). Ce fichier aligne boutique sur la convention
du reste du projet : la vue continue de créer la notification in-app immédiatement (DB seule,
rapide, voir apps.notifications.services.notifier) mais l'email part désormais en tâche de fond
— la requête HTTP ne dépend donc plus jamais de la disponibilité/latence du serveur SMTP.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import Commande

logger = logging.getLogger(__name__)


def _destinataire_email(commande: Commande) -> str | None:
    user = getattr(commande.membre, "user", None)
    return user.email if user and user.email else None


@shared_task
def envoyer_email_commande_confirmee(commande_id) -> None:
    try:
        commande = Commande.objects.select_related("membre__user").get(id=commande_id)
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email:
        return
    send_mail(
        subject=f"Commande {commande.numero_commande} confirmée",
        message=(
            f"Votre commande {commande.numero_commande} d'un montant de "
            f"{commande.montant_total} € a bien été enregistrée."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_commande_annulee(commande_id) -> None:
    try:
        commande = Commande.objects.select_related("membre__user").get(id=commande_id)
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email:
        return
    send_mail(
        subject=f"Commande {commande.numero_commande} annulée",
        message=f"Votre commande {commande.numero_commande} a été annulée.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_commande_expediee(commande_id) -> None:
    try:
        commande = Commande.objects.select_related("membre__user").get(id=commande_id)
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email:
        return
    if commande.numero_suivi:
        suivi = (
            f" Numéro de suivi : {commande.numero_suivi}"
            + (f" ({commande.transporteur})" if commande.transporteur else "")
            + "."
        )
    else:
        suivi = ""
    send_mail(
        subject=f"Commande {commande.numero_commande} expédiée",
        message=f"Votre commande {commande.numero_commande} vient d'être expédiée.{suivi}",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )

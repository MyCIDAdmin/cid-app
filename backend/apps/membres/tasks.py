"""
Tâches Celery — app membres (ajouté le 2026-09-19).

Emails accompagnant un changement AUTOMATIQUE de `Membre.statut`, déclenché par
`apps.membres.services.enregistrer_statut_annuel` (paiement de la cotisation annuelle confirmé ->
actif ; échéance dépassée sans paiement -> inactif — voir `apps.cotisations`). Toujours envoyés
via `.delay()`, jamais en ligne dans `services.py` — même convention que le reste du projet (voir
`apps.boutique.tasks` pour l'incident qui a établi cette règle : un `send_mail()` synchrone dans
un chemin de requête HTTP peut bloquer plusieurs dizaines de secondes si Railway bloque le SMTP
sortant)."""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from .models import Membre

logger = logging.getLogger(__name__)


def _destinataire_email(membre: Membre) -> str | None:
    user = getattr(membre, "user", None)
    return user.email if user and user.email else None


@shared_task
def envoyer_email_statut_actif(membre_id, annee) -> None:
    try:
        membre = Membre.objects.select_related("user").get(id=membre_id)
    except Membre.DoesNotExist:
        return
    email = _destinataire_email(membre)
    if not email:
        return
    send_mail(
        subject="Votre statut de membre est de nouveau actif",
        message=(
            f"Bonjour {membre.prenom},\n\n"
            f"Votre cotisation {annee} a bien été enregistrée comme payée : votre statut de "
            "membre est de nouveau actif.\n\n"
            "L'équipe Clubistes in Deutschland"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_statut_inactif(membre_id, annee) -> None:
    try:
        membre = Membre.objects.select_related("user").get(id=membre_id)
    except Membre.DoesNotExist:
        return
    email = _destinataire_email(membre)
    if not email:
        return
    send_mail(
        subject="Votre statut de membre est passé à inactif",
        message=(
            f"Bonjour {membre.prenom},\n\n"
            f"Votre cotisation {annee} n'a pas été réglée avant l'échéance : votre statut de "
            "membre est passé à inactif. Réglez-la depuis l'application, rubrique "
            '"Cotisation", pour être réactivé automatiquement.\n\n'
            "Contactez l'association si vous rencontrez une difficulté pour la régler.\n\n"
            "L'équipe Clubistes in Deutschland"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )

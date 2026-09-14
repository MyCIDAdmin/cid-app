"""
Tâches Celery — app communaute, lot Messagerie privée (CID-SCD-001 §résumé "notification
email si hors ligne").

Déclenchée par `MessagerieConsumer.receive_json` (voir consumers.py) quand un message est
envoyé et que le destinataire n'est PAS connecté au WebSocket de CETTE conversation au
moment de l'envoi (présence suivie via le cache Redis, voir consumers.py — portée par
conversation, pas un statut "en ligne" global).

Comme apps.evenements.tasks (voir son docstring) : l'envoi email est protégé (try/except,
un échec n'empêche jamais la notification in-app) et la notification in-app est créée
indépendamment de l'email. Le contenu du message n'est JAMAIS repris dans l'email/la
notification (CID-SCD-001 — la Messagerie privée est chiffrée précisément pour rester
confidentielle ; un sujet/corps générique évite de recréer une fuite en clair côté email)."""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.membres.models import Membre
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

logger = logging.getLogger(__name__)


@shared_task
def envoyer_notification_message_prive(destinataire_membre_id, expediteur_nom, conversation_id):
    """Email + notification in-app générique (sans contenu) pour un message reçu alors que
    le destinataire n'était pas connecté à la conversation. Retourne True si l'email a été
    envoyé avec succès (la notification in-app est tentée dans tous les cas)."""
    try:
        membre = Membre.objects.select_related("user").get(id=destinataire_membre_id)
    except Membre.DoesNotExist:
        return False

    user = membre.user
    lien = f"/messagerie/{conversation_id}"
    envoye = False

    if user and user.email:
        try:
            send_mail(
                subject="Nouveau message privé sur CID",
                message=(
                    f"{expediteur_nom} vous a envoyé un nouveau message privé.\n\n"
                    "Connectez-vous à l'application pour le lire."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
            envoye = True
        except Exception:  # noqa: BLE001 — un échec d'envoi isolé ne doit jamais bloquer
            logger.warning(
                "Échec envoi email message privé à %s (membre %s)",
                user.email,
                destinataire_membre_id,
            )

    if user:
        notifier(
            user,
            TypeNotification.MESSAGE_PRIVE_RECU,
            titre="Nouveau message privé",
            message=f"{expediteur_nom} vous a envoyé un message.",
            lien=lien,
        )

    return envoye

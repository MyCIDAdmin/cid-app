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
confidentielle ; un sujet/corps générique évite de recréer une fuite en clair côté email).

`envoyer_notification_message_groupe` (ajoutée le 2026-09-16, lot Groupes de chat) : même
brique de notification in-app mais PAS le même principe de présence — voir sa propre
docstring."""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.membres.models import Membre
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from . import services

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

    if user and user.email and email_module_actif("communaute"):
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


@shared_task
def envoyer_notification_message_groupe(groupe_id, auteur_membre_id):
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "Messaging und Austausch
    Module") — déclenchée par `GroupeChatConsumer.receive_json` à chaque message envoyé dans un
    groupe de chat. Contrairement à `envoyer_notification_message_prive` ci-dessus, aucun
    contrôle de présence : `GroupeChatConsumer` n'en tient aucun (voir docstring de tête
    consumers.py, "Aucun suivi de présence pour GroupeChatConsumer" — délibérément hors
    périmètre), donc notifie systématiquement tous les autres membres du groupe, même principe
    que `notifications.notifier_nouvelle_reponse_forum` (jamais l'auteur du message
    lui-même). Pas d'email — un chat de groupe est un flux temps réel à fort volume, l'email
    ferait plus de bruit que de service."""
    from .models import GroupeChat, MembreGroupe

    try:
        groupe = GroupeChat.objects.get(id=groupe_id)
    except GroupeChat.DoesNotExist:
        return 0

    try:
        auteur = Membre.objects.get(id=auteur_membre_id)
    except Membre.DoesNotExist:
        return 0

    lien = f"/groupes/{groupe_id}"
    titre = f"Nouveau message — {groupe.nom}"
    envoyes = 0
    membres = (
        MembreGroupe.objects.filter(groupe_id=groupe_id)
        .exclude(membre_id=auteur_membre_id)
        .select_related("membre__user")
    )
    for membre_groupe in membres:
        user = membre_groupe.membre.user
        if not user:
            continue
        notifier(
            user,
            TypeNotification.COMMUNAUTE_MESSAGE_GROUPE,
            titre=titre,
            message=f"{auteur} a envoyé un message dans {groupe.nom}.",
            lien=lien,
        )
        envoyes += 1

    return envoyes


@shared_task
def synchroniser_donnees_football():
    """Module Fan-Club (2026-09-24) — synchronise `ClassementLigue`, `RencontreCalendrier`
    et `StatistiqueJoueur` depuis GOAL API (voir services.py pour le détail, et l'approche
    "hybride" documentée dans models.py). Planifiée via Celery Beat, voir
    migrations/0007-0010 pour l'historique des fréquences (dernière en date :
    migrations/0010_migrer_vers_goal_api.py, qui bascule aussi la description de la
    planification). Délègue directement à `services.synchroniser_donnees_football()`
    (standings + fixtures paginés + effectif paginé — voir docstring de tête services.py)
    — déjà protégée individuellement (aucune levée d'exception attendue ici) ; ce wrapper
    ne fait que journaliser le résultat global."""
    resultat = services.synchroniser_donnees_football()
    logger.info(
        "Synchronisation Fan-Club GOAL API : %s lignes de classement, %s rencontres, "
        "%s statistiques joueurs, %s pronostics Tippspiel recalculés.",
        resultat["classement"],
        resultat["calendrier"],
        resultat["statistiques_joueurs"],
        resultat["tippspiel_points_maj"],
    )
    return resultat

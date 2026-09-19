"""
Tâches Celery — app adhesions (ajouté le 2026-09-16, demande utilisateur : "Baue notification wo
du siehst, dass es Sinn macht").

`envoyer_annonce_campagne` : déclenchée par `CampagneAdhesionViewSet.publier` (views.py), une
seule fois, au moment où la campagne passe de brouillon à publiée — même principe que
`apps.evenements.tasks.envoyer_invitations_evenement` (voir son docstring) : broadcast email +
notification in-app à tous les membres actifs, chaque envoi email individuel protégé
(fail_silently/try-except) pour qu'un échec isolé n'interrompe jamais la boucle, la notification
in-app créée indépendamment de l'email.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

from apps.membres.models import Membre, StatutMembre
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from .models import CampagneAdhesion

logger = logging.getLogger(__name__)


@shared_task
def envoyer_annonce_campagne(campagne_id) -> int:
    """Email + notification in-app à tous les membres actifs, déclenchée à la publication d'une
    campagne d'adhésion. Retourne le nombre d'annonces envoyées avec succès."""
    try:
        campagne = CampagneAdhesion.objects.prefetch_related("offres").get(id=campagne_id)
    except CampagneAdhesion.DoesNotExist:
        return 0

    membres = Membre.objects.filter(statut=StatutMembre.ACTIF).select_related("user")
    lien = "/mon-adhesion"
    envoyes = 0
    offres = "\n".join(
        f"  - {offre.nom} : {offre.prix_plein} €" for offre in campagne.offres.filter(visible=True)
    )

    for membre in membres:
        user = membre.user
        if not user or not user.email:
            continue
        if email_module_actif("adhesions"):
            try:
                send_mail(
                    subject=f"Nouvelle campagne d'adhésion : {campagne.nom}",
                    message=(
                        f"La campagne d'adhésion {campagne.nom} ({campagne.annee}) vient d'être "
                        f"publiée, du {campagne.date_debut:%d/%m/%Y} au "
                        f"{campagne.date_fin:%d/%m/%Y}.\n\n"
                        f"{campagne.description}\n\n"
                        f"Offres disponibles :\n{offres}\n\n"
                        "Consultez la page Mon adhésion pour souscrire."
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
                envoyes += 1
            except (
                Exception
            ):  # noqa: BLE001 — un échec d'envoi isolé ne doit jamais bloquer la boucle
                logger.warning(
                    "envoyer_annonce_campagne: échec d'envoi pour user=%s campagne=%s",
                    user.id,
                    campagne_id,
                )
        notifier(
            user,
            TypeNotification.ADHESION_CAMPAGNE_PUBLIEE,
            titre=f"Nouvelle campagne d'adhésion : {campagne.nom}",
            message=f"La campagne {campagne.nom} ({campagne.annee}) est maintenant ouverte.",
            lien=lien,
        )

    return envoyes

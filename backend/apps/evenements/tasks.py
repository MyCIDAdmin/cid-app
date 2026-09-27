"""
Tâches Celery — app evenements (Phase 2B, RICEFW W-004/W-005 — différées lors de la Phase 2A,
voir docstring de models.py).

W-004 (invitation événement) : déclenchée par `EvenementViewSet.publier` (views.py), une seule
fois, au moment où l'événement passe de brouillon à publié.
W-005 (rappel J-3/J-1) : planifiée par Celery Beat, une fois par jour à 10h00 (voir la migration
0002_planifier_rappels_evenements, même principe que apps.cotisations 0003).

`envoyer_annulation_evenement` (ajoutée le 2026-09-16, demande utilisateur : "Baue notification wo
du siehst, dass es Sinn macht") : déclenchée par `EvenementViewSet.annuler`, à chaque inscrit non
annulé (même portée que `envoyer_rappels_evenements` ci-dessous) — même principe de broadcast que
`envoyer_invitations_evenement`.

Comme apps.cotisations.tasks (voir son docstring), chaque envoi email individuel est protégé
(`fail_silently`/try-except) pour qu'un échec isolé n'interrompe jamais la boucle sur les membres
suivants — et la notification in-app est créée indépendamment de l'email, jamais conditionnée à
son succès (contrairement à la relance cotisation, où seul un envoi réussi consomme le verrou
d'idempotence : ici il n'y a pas de verrou équivalent à contourner).

`evenement.description` contient désormais du HTML (éditeur "word-like" TipTap côté
AdminEventsPage, demande utilisateur du 2026-09-27 point 11.3 — même principe que
apps.adhesions.tasks.envoyer_annonce_campagne) — ces emails restent des `send_mail` texte brut
(pas de version HTML), donc `strip_tags` avant interpolation, sinon les balises brutes
apparaîtraient telles quelles dans la boîte de réception du membre. `strip_tags` sur une
ancienne description en texte brut (sans balises, créées avant ce changement) est un no-op,
donc rétro-compatible.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.html import strip_tags

from apps.membres.models import Membre, StatutMembre
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from .models import Evenement, StatutEvenement, StatutInscription

logger = logging.getLogger(__name__)


def _details_evenement(evenement: Evenement) -> str:
    """Détails de l'événement (demande utilisateur du 2026-09-19 : "Füge zu den versendeten
    Mails mehr Details hinzu")."""
    cout = f"{evenement.cout} €" if evenement.cout else "Gratuit"
    return (
        f"{strip_tags(evenement.description).strip()}\n\n"
        f"Date : {evenement.date_evenement:%d/%m/%Y}\n"
        f"Lieu : {evenement.lieu}\n"
        f"Coût : {cout}"
    )


@shared_task
def envoyer_invitations_evenement(evenement_id) -> int:
    """W-004 — invitation email + notification in-app à tous les membres actifs, déclenchée à la
    publication d'un événement. Retourne le nombre d'invitations envoyées avec succès."""
    try:
        evenement = Evenement.objects.get(id=evenement_id)
    except Evenement.DoesNotExist:
        return 0

    membres = Membre.objects.filter(statut=StatutMembre.ACTIF).select_related("user")
    # Corrigé le 2026-09-19 (retour utilisateur, clic sur notification sans effet) :
    # "/evenements/{id}" ne correspond à aucune route du frontend (pas de page de détail par
    # événement, voir App.tsx) — ?evenement= permet à EvenementsPage de retrouver et mettre en
    # évidence la carte correspondante (voir useDeepLinkCible côté frontend).
    lien = f"/evenements?evenement={evenement.id}"
    envoyes = 0

    for membre in membres:
        user = membre.user
        if not user or not user.email:
            continue
        if email_module_actif("evenements"):
            try:
                send_mail(
                    subject=f"Nouvel événement : {evenement.titre}",
                    message=(
                        f"Un nouvel événement vient d'être publié : {evenement.titre}.\n\n"
                        f"{_details_evenement(evenement)}\n\n"
                        "Consultez la page Événements pour vous inscrire."
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
                    "envoyer_invitations_evenement: échec d'envoi pour user=%s evenement=%s",
                    user.id,
                    evenement_id,
                )
        notifier(
            user,
            TypeNotification.EVENEMENT_INVITATION,
            titre=f"Nouvel événement : {evenement.titre}",
            message=f"Un nouvel événement a été publié le {evenement.date_evenement:%d/%m/%Y}.",
            lien=lien,
        )

    return envoyes


@shared_task
def envoyer_annulation_evenement(evenement_id) -> int:
    """Email + notification in-app à chaque inscrit non annulé, déclenchée à l'annulation d'un
    événement (ajouté le 2026-09-16). Retourne le nombre d'annulations notifiées avec succès."""
    try:
        evenement = Evenement.objects.get(id=evenement_id)
    except Evenement.DoesNotExist:
        return 0

    inscriptions = evenement.inscriptions.exclude(statut=StatutInscription.ANNULEE).select_related(
        "membre__user"
    )
    lien = f"/evenements?evenement={evenement.id}"  # voir envoyer_invitations_evenement
    envoyes = 0

    for inscription in inscriptions:
        user = inscription.membre.user
        if not user or not user.email:
            continue
        if email_module_actif("evenements"):
            try:
                send_mail(
                    subject=f"Événement annulé : {evenement.titre}",
                    message=(
                        f"L'événement {evenement.titre}, prévu le "
                        f"{evenement.date_evenement:%d/%m/%Y} à {evenement.lieu}, a été annulé.\n\n"
                        f"Places réservées : {inscription.places} — montant payé : "
                        f"{inscription.montant_paye} €. Contactez l'association pour un "
                        "remboursement le cas échéant."
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
                envoyes += 1
            except Exception:  # noqa: BLE001 — voir docstring de module
                logger.warning(
                    "envoyer_annulation_evenement: échec d'envoi pour user=%s evenement=%s",
                    user.id,
                    evenement_id,
                )
        notifier(
            user,
            TypeNotification.EVENEMENT_ANNULE,
            titre=f"Événement annulé : {evenement.titre}",
            message=f"{evenement.titre} ({evenement.date_evenement:%d/%m/%Y}) a été annulé.",
            lien=lien,
        )

    return envoyes


@shared_task
def envoyer_rappels_evenements(today=None) -> int:
    """
    W-005 — rappel J-3/J-1, Celery Beat quotidien 10h00. Scanne les événements publiés dont la
    date tombe dans exactement 3 ou 1 jour(s) et relance chaque inscrit actif (statut != annulée).
    Retourne le nombre de rappels envoyés avec succès.
    """
    today = today or timezone.now().date()
    envoyes = 0

    for decalage, label in ((3, "J-3"), (1, "J-1")):
        date_cible = today + timedelta(days=decalage)
        evenements = Evenement.objects.filter(
            statut=StatutEvenement.PUBLIE, date_evenement=date_cible
        )
        for evenement in evenements:
            inscriptions = evenement.inscriptions.exclude(
                statut=StatutInscription.ANNULEE
            ).select_related("membre__user")
            lien = f"/evenements?evenement={evenement.id}"  # voir envoyer_invitations_evenement
            for inscription in inscriptions:
                membre = inscription.membre
                user = membre.user
                if not user or not user.email:
                    continue
                if email_module_actif("evenements"):
                    try:
                        send_mail(
                            subject=f"Rappel — {evenement.titre} ({label})",
                            message=(
                                f"Rappel : {evenement.titre} a lieu le "
                                f"{evenement.date_evenement:%d/%m/%Y} à {evenement.lieu}. "
                                f"Vous êtes inscrit(e) pour {inscription.places} place(s).\n\n"
                                f"{strip_tags(evenement.description).strip()}"
                            ),
                            from_email=settings.DEFAULT_FROM_EMAIL,
                            recipient_list=[user.email],
                            fail_silently=False,
                        )
                        envoyes += 1
                    except Exception:  # noqa: BLE001 — voir docstring de module
                        logger.warning(
                            "envoyer_rappels_evenements: échec d'envoi pour user=%s evenement=%s",
                            user.id,
                            evenement.id,
                        )
                notifier(
                    user,
                    TypeNotification.EVENEMENT_RAPPEL,
                    titre=f"Rappel — {evenement.titre}",
                    message=f"{evenement.titre} a lieu le {evenement.date_evenement:%d/%m/%Y}.",
                    lien=lien,
                )

    return envoyes

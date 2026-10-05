"""
Tâches Celery — app adhesions (ajouté le 2026-09-16, demande utilisateur : "Baue notification wo
du siehst, dass es Sinn macht").

`envoyer_annonce_campagne` : déclenchée par `CampagneAdhesionViewSet.publier` (views.py), une
seule fois, au moment où la campagne passe de brouillon à publiée — même principe que
`apps.evenements.tasks.envoyer_invitations_evenement` (voir son docstring) : broadcast email +
notification in-app à tous les membres actifs, chaque envoi email individuel protégé
(fail_silently/try-except) pour qu'un échec isolé n'interrompe jamais la boucle, la notification
in-app créée indépendamment de l'email.

`campagne.description` contient désormais du HTML (éditeur "word-like" TipTap côté
AdminCampagnesPage, demande utilisateur du 2026-09-25 : "Beschreibungs-Editor zu word-like editor
umwandeln") — cet email reste un `send_mail` texte brut (pas de version HTML), donc `strip_tags`
avant interpolation, sinon les balises brutes apparaîtraient telles quelles dans la boîte de
réception du membre. `strip_tags` sur une ancienne description en texte brut (sans balises,
créées avant ce changement) est un no-op, donc rétro-compatible.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils.html import strip_tags

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
                        f"{strip_tags(campagne.description).strip()}\n\n"
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


@shared_task
def basculer_membres_non_renouveles() -> int:
    """Point 3 (2026-10-06) — quotidien. Pour chaque campagne dont la date limite de
    renouvellement est passée (et pas encore traitée) : tout membre ACTIF ayant une adhésion
    payée dans la campagne précédente mais pas dans celle-ci devient non-membre (INACTIF).
    Passe par enregistrer_statut_annuel -> historique annuel conservé + notification.
    Idempotent : une campagne n'est traitée qu'une fois (bascule_non_renouveles_le)."""
    from django.utils import timezone

    from apps.membres.models import RaisonChangementStatut
    from apps.membres.services import enregistrer_statut_annuel

    from .models import StatutSouscription

    bascules = 0
    a_traiter = CampagneAdhesion.objects.filter(
        date_limite_renouvellement__lte=timezone.localdate(),
        bascule_non_renouveles_le__isnull=True,
    ).order_by("annee")
    for campagne in a_traiter:
        precedente = (
            CampagneAdhesion.objects.filter(annee__lt=campagne.annee)
            .order_by("-annee", "-date_debut")
            .first()
        )
        if precedente is not None:
            renouveles = campagne.souscriptions.filter(statut=StatutSouscription.PAYEE).values_list(
                "membre_id", flat=True
            )
            membres = (
                Membre.objects.filter(
                    statut=StatutMembre.ACTIF,
                    souscriptions__campagne=precedente,
                    souscriptions__statut=StatutSouscription.PAYEE,
                )
                .exclude(id__in=renouveles)
                .distinct()
            )
            for membre in membres:
                enregistrer_statut_annuel(
                    membre,
                    campagne.annee,
                    StatutMembre.INACTIF,
                    RaisonChangementStatut.NON_RENOUVELE,
                )
                bascules += 1
        campagne.bascule_non_renouveles_le = timezone.now()
        campagne.save(update_fields=["bascule_non_renouveles_le"])
    return bascules

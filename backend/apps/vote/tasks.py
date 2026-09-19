"""
Tâches Celery — app vote (RICEFW W-006, Timeline Phase 3) :

  envoyer_notification_ouverture : déclenchée une fois par VoteSessionViewSet.create, à la
    création (= ouverture immédiate, RICEFW W-006) d'une session — email + notification
    in-app à tous les membres éligibles.
  envoyer_notification_resultats : déclenchée à la clôture (manuelle via `cloturer`, ou
    automatique via clore_sessions_expirees ci-dessous) — email + notification in-app
    "résultats disponibles".
  clore_sessions_expirees : planifiée par Celery Beat toutes les minutes (migration
    0002_planifier_cloture_votes) — clôture toute session OUVERTE dont date_fin est
    dépassée, calcule les résultats et les diffuse au groupe WebSocket correspondant.

Même principe de robustesse que apps.evenements.tasks (voir son docstring) : chaque envoi
email individuel est protégé (try/except), la notification in-app est créée indépendamment
du succès de l'email."""

import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import StatutSession
from .services import calculer_resultats, membres_eligibles_qs

logger = logging.getLogger(__name__)


def _get_session(session_id):
    from .models import VoteSession

    try:
        return VoteSession.objects.get(id=session_id)
    except VoteSession.DoesNotExist:
        return None


def _notifier_eligibles(session, type_notification, sujet, message) -> int:
    # Corrigé le 2026-09-19 (retour utilisateur : clic sur la notification "Wahlen offen" ne
    # naviguait nulle part) — l'ancien lien "/vote" ne correspondait à aucune route du frontend
    # (la route réelle est "/votes", pluriel, voir App.tsx). Le paramètre ?session= permet en
    # plus à VotePage de rouvrir directement la bonne session (active ou déjà clôturée dans
    # l'historique), voir useDeepLinkCible côté frontend.
    lien = f"/votes?session={session.id}"
    envoyes = 0
    for membre in membres_eligibles_qs(session).select_related("user"):
        user = membre.user
        if not user or not user.email:
            continue
        try:
            send_mail(
                subject=sujet,
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )
            envoyes += 1
        except Exception:  # noqa: BLE001 — un échec d'envoi isolé ne bloque jamais la boucle
            logger.warning(
                "vote.tasks: échec d'envoi email pour user=%s session=%s", user.id, session.id
            )
        notifier(user, type_notification, titre=sujet, message=message, lien=lien)
    return envoyes


@shared_task
def envoyer_notification_ouverture(session_id) -> int:
    session = _get_session(session_id)
    if session is None:
        return 0
    return _notifier_eligibles(
        session,
        TypeNotification.VOTE_OUVERTURE,
        f"Vote ouvert : {session.titre}",
        f"Une nouvelle session de vote est ouverte : {session.titre}. "
        f"Vous avez jusqu'au {session.date_fin:%d/%m/%Y %H:%M} pour voter.",
    )


@shared_task
def envoyer_notification_resultats(session_id) -> int:
    session = _get_session(session_id)
    if session is None:
        return 0
    return _notifier_eligibles(
        session,
        TypeNotification.VOTE_RESULTATS,
        f"Résultats disponibles : {session.titre}",
        f"Les résultats du vote « {session.titre} » sont disponibles.",
    )


@shared_task
def clore_sessions_expirees() -> int:
    """W-006 (clôture) — Celery Beat, chaque minute (migration
    0002_planifier_cloture_votes). Retourne le nombre de sessions clôturées."""
    from channels.layers import get_channel_layer

    from .models import VoteSession

    maintenant = timezone.now()
    sessions = VoteSession.objects.filter(statut=StatutSession.OUVERTE, date_fin__lte=maintenant)
    channel_layer = get_channel_layer()
    cloturees = 0

    for session in sessions:
        session.statut = StatutSession.CLOTUREE
        session.date_cloture = maintenant
        session.save(update_fields=["statut", "date_cloture"])
        cloturees += 1

        envoyer_notification_resultats.delay(str(session.id))

        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                f"vote_{session.id}",
                {"type": "resultats_disponibles", "payload": calculer_resultats(session)},
            )

    return cloturees

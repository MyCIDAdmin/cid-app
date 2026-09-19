"""Tests — apps.vote.tasks (notifications + clôture automatique Celery Beat)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.notifications.models import Notification, TypeNotification
from apps.vote.models import StatutSession
from apps.vote.tasks import (
    clore_sessions_expirees,
    envoyer_notification_ouverture,
    envoyer_notification_resultats,
)
from apps.vote.tests.factories import VoteSessionFactory, user_membre_avec_fiche

pytestmark = pytest.mark.django_db


def test_envoyer_notification_ouverture_notifie_les_eligibles():
    session = VoteSessionFactory()
    _, membre = user_membre_avec_fiche(email="eligible@example.de")
    envoyer_notification_ouverture(str(session.id))
    notification = Notification.objects.get(
        destinataire=membre.user, type_notification=TypeNotification.VOTE_OUVERTURE
    )
    # Corrigé le 2026-09-19 — l'ancien lien "/vote" ne correspondait à aucune route du frontend
    # (voir docstring de _notifier_eligibles).
    assert notification.lien == f"/votes?session={session.id}"


def test_envoyer_notification_resultats_notifie_les_eligibles():
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    _, membre = user_membre_avec_fiche(email="eligible2@example.de")
    envoyer_notification_resultats(str(session.id))
    notification = Notification.objects.get(
        destinataire=membre.user, type_notification=TypeNotification.VOTE_RESULTATS
    )
    assert notification.lien == f"/votes?session={session.id}"


def test_clore_sessions_expirees_cloture_uniquement_les_sessions_depassees():
    session_expiree = VoteSessionFactory(
        statut=StatutSession.OUVERTE, date_fin=timezone.now() - timedelta(minutes=1)
    )
    session_en_cours = VoteSessionFactory(
        statut=StatutSession.OUVERTE, date_fin=timezone.now() + timedelta(minutes=30)
    )

    nb = clore_sessions_expirees()

    assert nb == 1
    session_expiree.refresh_from_db()
    session_en_cours.refresh_from_db()
    assert session_expiree.statut == StatutSession.CLOTUREE
    assert session_expiree.date_cloture is not None
    assert session_en_cours.statut == StatutSession.OUVERTE
    assert session_en_cours.date_cloture is None


def test_clore_sessions_expirees_est_idempotent():
    VoteSessionFactory(statut=StatutSession.OUVERTE, date_fin=timezone.now() - timedelta(minutes=1))
    assert clore_sessions_expirees() == 1
    assert clore_sessions_expirees() == 0  # déjà clôturée, ne la reclôture pas

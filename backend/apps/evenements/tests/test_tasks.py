"""Tests tâches Celery — app evenements (Phase 2B, RICEFW W-004/W-005)."""

import datetime

import pytest

from apps.accounts.models import User
from apps.evenements.models import StatutInscription
from apps.evenements.tasks import (
    envoyer_annulation_evenement,
    envoyer_invitations_evenement,
    envoyer_rappels_evenements,
)
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


def _membre_actif_avec_compte(email):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user, statut=StatutMembre.ACTIF)


# --- envoyer_invitations_evenement (W-004) ---


def test_invitation_envoyee_a_tous_les_membres_actifs(mailoutbox):
    m1 = _membre_actif_avec_compte("m1@example.de")
    m2 = _membre_actif_avec_compte("m2@example.de")
    evenement = EvenementFactory(titre="AG Berlin")

    envoyes = envoyer_invitations_evenement(str(evenement.id))

    assert envoyes == 2
    assert len(mailoutbox) == 2
    assert (
        Notification.objects.filter(
            destinataire__in=[m1.user, m2.user],
            type_notification=TypeNotification.EVENEMENT_INVITATION,
        ).count()
        == 2
    )
    notification = Notification.objects.filter(destinataire=m1.user).first()
    assert notification.lien == f"/evenements?evenement={evenement.id}"


def test_invitation_ignore_les_membres_inactifs(mailoutbox):
    MembreFactory(statut=StatutMembre.INACTIF)
    evenement = EvenementFactory()

    envoyes = envoyer_invitations_evenement(str(evenement.id))

    assert envoyes == 0
    assert len(mailoutbox) == 0
    assert Notification.objects.count() == 0


def test_invitation_evenement_introuvable_ne_leve_pas():
    assert envoyer_invitations_evenement("00000000-0000-0000-0000-000000000000") == 0


# --- envoyer_rappels_evenements (W-005) ---


def test_rappel_j3_envoye_aux_inscrits(mailoutbox):
    membre = _membre_actif_avec_compte("inscrit@example.de")
    aujourdhui = datetime.date(2027, 3, 1)
    evenement = EvenementFactory(date_evenement=aujourdhui + datetime.timedelta(days=3))
    InscriptionFactory(evenement=evenement, membre=membre)

    envoyes = envoyer_rappels_evenements(today=aujourdhui)

    assert envoyes == 1
    assert len(mailoutbox) == 1
    notification = Notification.objects.get(destinataire=membre.user)
    assert notification.type_notification == TypeNotification.EVENEMENT_RAPPEL
    assert notification.lien == f"/evenements?evenement={evenement.id}"


def test_rappel_ignore_les_inscriptions_annulees(mailoutbox):
    membre = _membre_actif_avec_compte("annule@example.de")
    aujourdhui = datetime.date(2027, 3, 1)
    evenement = EvenementFactory(date_evenement=aujourdhui + datetime.timedelta(days=1))
    InscriptionFactory(evenement=evenement, membre=membre, statut=StatutInscription.ANNULEE)

    envoyes = envoyer_rappels_evenements(today=aujourdhui)

    assert envoyes == 0
    assert len(mailoutbox) == 0


def test_rappel_ignore_les_evenements_hors_fenetre(mailoutbox):
    membre = _membre_actif_avec_compte("horsfenetre@example.de")
    aujourdhui = datetime.date(2027, 3, 1)
    evenement = EvenementFactory(date_evenement=aujourdhui + datetime.timedelta(days=5))
    InscriptionFactory(evenement=evenement, membre=membre)

    envoyes = envoyer_rappels_evenements(today=aujourdhui)

    assert envoyes == 0
    assert len(mailoutbox) == 0


# --- envoyer_annulation_evenement (ajoutée le 2026-09-16) ---


def test_annulation_envoyee_aux_inscrits_non_annules(mailoutbox):
    m1 = _membre_actif_avec_compte("inscrit1@example.de")
    m2 = _membre_actif_avec_compte("desinscrit@example.de")
    evenement = EvenementFactory(titre="AG Berlin")
    InscriptionFactory(evenement=evenement, membre=m1)
    InscriptionFactory(evenement=evenement, membre=m2, statut=StatutInscription.ANNULEE)

    envoyes = envoyer_annulation_evenement(str(evenement.id))

    assert envoyes == 1
    assert len(mailoutbox) == 1
    notification = Notification.objects.get(destinataire=m1.user)
    assert notification.type_notification == TypeNotification.EVENEMENT_ANNULE
    assert notification.lien == f"/evenements?evenement={evenement.id}"
    assert Notification.objects.filter(destinataire=m2.user).count() == 0


def test_annulation_evenement_introuvable_ne_leve_pas():
    assert envoyer_annulation_evenement("00000000-0000-0000-0000-000000000000") == 0

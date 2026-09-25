"""Tests tâche Celery `envoyer_annonce_campagne` (ajoutée le 2026-09-16, demande utilisateur :
"Baue notification wo du siehst, dass es Sinn macht") — même principe que
apps.evenements.tests.test_tasks."""

import pytest

from apps.accounts.models import User
from apps.adhesions.tasks import envoyer_annonce_campagne
from apps.adhesions.tests.factories import CampagneAdhesionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


def _membre_actif_avec_compte(email):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user, statut=StatutMembre.ACTIF)


def test_annonce_envoyee_a_tous_les_membres_actifs(mailoutbox):
    m1 = _membre_actif_avec_compte("m1@example.de")
    m2 = _membre_actif_avec_compte("m2@example.de")
    campagne = CampagneAdhesionFactory(nom="Campagne 2027")

    envoyes = envoyer_annonce_campagne(str(campagne.id))

    assert envoyes == 2
    assert len(mailoutbox) == 2
    assert (
        Notification.objects.filter(
            destinataire__in=[m1.user, m2.user],
            type_notification=TypeNotification.ADHESION_CAMPAGNE_PUBLIEE,
        ).count()
        == 2
    )


def test_annonce_ignore_les_membres_inactifs(mailoutbox):
    MembreFactory(statut=StatutMembre.INACTIF)
    campagne = CampagneAdhesionFactory()

    envoyes = envoyer_annonce_campagne(str(campagne.id))

    assert envoyes == 0
    assert len(mailoutbox) == 0
    assert Notification.objects.count() == 0


def test_annonce_campagne_introuvable_ne_leve_pas():
    assert envoyer_annonce_campagne("00000000-0000-0000-0000-000000000000") == 0


def test_annonce_supprime_le_html_de_la_description(mailoutbox):
    # Ajouté le 2026-09-25 (demande utilisateur, module "Verwaltung der
    # Mitgliedschaftskampagnen" : "Beschreibungs-Editor zu word-like editor umwandeln") —
    # campagne.description contient désormais du HTML (éditeur TipTap côté AdminCampagnesPage),
    # cet email reste du texte brut : les balises ne doivent jamais fuiter telles quelles dans la
    # boîte de réception d'un membre.
    _membre_actif_avec_compte("m1@example.de")
    campagne = CampagneAdhesionFactory(
        nom="Campagne 2027",
        description="<p>Nouvelle <strong>campagne</strong> annuelle.</p><p>Inscrivez-vous !</p>",
    )

    envoyer_annonce_campagne(str(campagne.id))

    assert len(mailoutbox) == 1
    corps = mailoutbox[0].body
    assert "<p>" not in corps
    assert "<strong>" not in corps
    assert "Nouvelle campagne annuelle." in corps
    assert "Inscrivez-vous !" in corps

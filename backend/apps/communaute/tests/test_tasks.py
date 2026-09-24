"""Tests tâches Celery — app communaute, lot Groupes de chat (ajoutées le 2026-09-16, retour
utilisateur : "Es soll bei allen Admin Modulen aber auch bei Messaging und Austausch Modulen
funktionieren"). Même principe que apps.adhesions.tests.test_tasks : la tâche est appelée
directement (synchrone), jamais via `.delay()` — voir test_consumers.py pour la vérification que
GroupeChatConsumer déclenche bien l'appel `.delay()` correspondant."""

import pytest

from apps.accounts.models import User
from apps.communaute.tasks import envoyer_notification_message_groupe, synchroniser_donnees_football
from apps.communaute.tests.factories import GroupeChatFactory, MembreGroupeFactory
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


def _membre_avec_compte(email):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user)


def test_notifie_tous_les_autres_membres_du_groupe():
    groupe = GroupeChatFactory(nom="Supporters Berlin")
    auteur = _membre_avec_compte("auteur-groupe@example.de")
    m1 = _membre_avec_compte("m1-groupe@example.de")
    m2 = _membre_avec_compte("m2-groupe@example.de")
    MembreGroupeFactory(groupe=groupe, membre=auteur)
    MembreGroupeFactory(groupe=groupe, membre=m1)
    MembreGroupeFactory(groupe=groupe, membre=m2)

    envoyes = envoyer_notification_message_groupe(str(groupe.id), str(auteur.id))

    assert envoyes == 2
    for membre in (m1, m2):
        notification = Notification.objects.get(destinataire=membre.user)
        assert notification.type_notification == TypeNotification.COMMUNAUTE_MESSAGE_GROUPE
        assert notification.lien == f"/groupes/{groupe.id}"
    # L'auteur du message ne se notifie jamais lui-même.
    assert not Notification.objects.filter(destinataire=auteur.user).exists()


def test_ignore_les_membres_sans_compte_user():
    groupe = GroupeChatFactory()
    auteur = _membre_avec_compte("auteur-groupe2@example.de")
    MembreGroupeFactory(groupe=groupe, membre=auteur)
    MembreGroupeFactory(groupe=groupe, membre=MembreFactory())  # sans user lié

    envoyes = envoyer_notification_message_groupe(str(groupe.id), str(auteur.id))

    assert envoyes == 0
    assert Notification.objects.count() == 0


def test_groupe_introuvable_ne_leve_pas():
    auteur = _membre_avec_compte("auteur-groupe3@example.de")
    assert (
        envoyer_notification_message_groupe("00000000-0000-0000-0000-000000000000", str(auteur.id))
        == 0
    )


def test_auteur_introuvable_ne_leve_pas():
    groupe = GroupeChatFactory()
    assert (
        envoyer_notification_message_groupe(str(groupe.id), "00000000-0000-0000-0000-000000000000")
        == 0
    )


# ---------------------------------------------------------------------------
# Fan-Club — synchroniser_donnees_football (2026-09-24, bascule SerpApi le même jour, voir
# services.py pour le détail — un seul appel SerpApi partagé, déjà testé de bout en bout
# dans test_serpapi.py::test_synchroniser_donnees_football_ne_fait_quun_seul_appel_http).
# Ici, la tâche Celery se contente de déléguer et journaliser : on vérifie uniquement
# qu'elle relaie fidèlement le résultat de services.synchroniser_donnees_football().
# ---------------------------------------------------------------------------


def test_synchroniser_donnees_football_relaie_le_resultat_du_service(monkeypatch):
    from apps.communaute import tasks as tasks_module

    monkeypatch.setattr(
        tasks_module.services,
        "synchroniser_donnees_football",
        lambda: {"classement": 3, "calendrier": 5},
    )

    resultat = synchroniser_donnees_football()

    assert resultat == {"classement": 3, "calendrier": 5}

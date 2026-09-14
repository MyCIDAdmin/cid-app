"""
Tests — MessagerieConsumer / GroupeChatConsumer (WebSocket). Même principe que
apps.vote.tests.test_consumer (voir son docstring) : pas de pytest-asyncio dans ce projet,
chaque test synchrone pilote sa propre coroutine via `asyncio.run(...)`, et
`django_db(transaction=True)` est nécessaire car `database_sync_to_async` exécute l'ORM
dans un thread séparé, qui a besoin d'une transaction réellement validée en base."""

import asyncio

import pytest
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.core.cache import cache
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.ws_auth import JWTAuthMiddlewareStack
from apps.communaute.models import Conversation, MembreGroupe, MessageGroupe, MessagePrive
from apps.communaute.routing import websocket_urlpatterns
from apps.communaute.tests.factories import (
    GroupeChatFactory,
    MembreGroupeFactory,
    user_membre_avec_fiche,
)

pytestmark = pytest.mark.django_db(transaction=True)


def _application():
    return JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))


async def _connect(path, user):
    token = str(AccessToken.for_user(user))
    communicator = WebsocketCommunicator(_application(), f"{path}?token={token}")
    connected, _ = await communicator.connect()
    return communicator, connected


# --- MessagerieConsumer ---


def test_connexion_messagerie_refusee_sans_authentification():
    async def run():
        communicator = WebsocketCommunicator(
            _application(), "/ws/messagerie/00000000-0000-0000-0000-000000000000/"
        )
        connected, _ = await communicator.connect()
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_connexion_messagerie_refusee_a_un_non_participant():
    _, m1 = user_membre_avec_fiche(email="msg1@example.de")
    _, m2 = user_membre_avec_fiche(email="msg2@example.de")
    _, intrus = user_membre_avec_fiche(email="msg3@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)

    async def run():
        communicator, connected = await _connect(f"/ws/messagerie/{conversation.id}/", intrus.user)
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_envoi_dun_message_prive_est_enregistre_chiffre_et_diffuse():
    _, m1 = user_membre_avec_fiche(email="msg4@example.de")
    _, m2 = user_membre_avec_fiche(email="msg5@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)

    async def run():
        communicator, connected = await _connect(f"/ws/messagerie/{conversation.id}/", m1.user)
        assert connected is True

        await communicator.send_json_to({"type": "message", "contenu": "Salut !"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "message"
        assert recu["contenu"] == "Salut !"
        assert recu["expediteur"] == str(m1.id)

        await communicator.disconnect()

    asyncio.run(run())

    message = MessagePrive.objects.get(conversation=conversation)
    assert message.contenu == "Salut !"
    assert message.expediteur_id == m1.id


def test_marquer_lu_diffuse_un_accuse_de_lecture():
    _, m1 = user_membre_avec_fiche(email="msg6@example.de")
    _, m2 = user_membre_avec_fiche(email="msg7@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)
    MessagePrive.objects.create(conversation=conversation, expediteur=m1, contenu="Non lu")

    async def run():
        communicator, _ = await _connect(f"/ws/messagerie/{conversation.id}/", m2.user)
        await communicator.send_json_to({"type": "lu"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "lu"
        assert recu["lu_par"] == str(m2.id)
        await communicator.disconnect()

    asyncio.run(run())

    message = MessagePrive.objects.get(conversation=conversation)
    assert message.est_lu is True


def test_presence_en_ligne_empeche_la_notification_hors_ligne(monkeypatch):
    _, m1 = user_membre_avec_fiche(email="msg8@example.de")
    _, m2 = user_membre_avec_fiche(email="msg9@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)

    appels = []
    monkeypatch.setattr(
        "apps.communaute.tasks.envoyer_notification_message_prive.delay",
        lambda *args, **kwargs: appels.append((args, kwargs)),
    )

    async def run():
        # Les deux participants sont connectés à CETTE conversation -> pas d'email.
        com1, _ = await _connect(f"/ws/messagerie/{conversation.id}/", m1.user)
        com2, _ = await _connect(f"/ws/messagerie/{conversation.id}/", m2.user)

        await com1.send_json_to({"type": "message", "contenu": "Salut !"})
        await com1.receive_json_from()  # broadcast reçu par l'expéditeur lui-même
        await com2.receive_json_from()  # broadcast reçu par le destinataire

        await com1.disconnect()
        await com2.disconnect()

    asyncio.run(run())
    assert appels == []
    cache.clear()


def test_absence_en_ligne_declenche_la_notification_hors_ligne(monkeypatch):
    _, m1 = user_membre_avec_fiche(email="msg10@example.de")
    _, m2 = user_membre_avec_fiche(email="msg11@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)

    appels = []
    monkeypatch.setattr(
        "apps.communaute.tasks.envoyer_notification_message_prive.delay",
        lambda *args, **kwargs: appels.append(args),
    )

    async def run():
        # m2 n'est JAMAIS connecté -> "hors ligne" au sens de ce module.
        communicator, _ = await _connect(f"/ws/messagerie/{conversation.id}/", m1.user)
        await communicator.send_json_to({"type": "message", "contenu": "Tu es là ?"})
        await communicator.receive_json_from()
        await communicator.disconnect()

    asyncio.run(run())
    assert len(appels) == 1
    assert appels[0][0] == str(m2.id)
    cache.clear()


# --- GroupeChatConsumer ---


def test_connexion_groupe_refusee_si_pas_encore_membre():
    _, m1 = user_membre_avec_fiche(email="grp1@example.de")
    groupe = GroupeChatFactory()

    async def run():
        communicator, connected = await _connect(f"/ws/groupes/{groupe.id}/", m1.user)
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_connexion_groupe_acceptee_pour_un_membre_puis_message_diffuse():
    _, m1 = user_membre_avec_fiche(email="grp2@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=m1)

    async def run():
        communicator, connected = await _connect(f"/ws/groupes/{groupe.id}/", m1.user)
        assert connected is True

        await communicator.send_json_to({"type": "message", "contenu": "Salut le groupe !"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "message"
        assert recu["contenu"] == "Salut le groupe !"
        assert recu["auteur"]["id"] == str(m1.id)

        await communicator.disconnect()

    asyncio.run(run())
    assert MessageGroupe.objects.filter(groupe=groupe).count() == 1


def test_rejoindre_ne_cree_aucune_appartenance_via_le_websocket():
    """La connexion WebSocket ne doit jamais créer d'appartenance elle-même — rejoindre un
    groupe public est une action REST explicite (voir GroupeChatViewSet.rejoindre)."""
    _, m1 = user_membre_avec_fiche(email="grp3@example.de")
    groupe = GroupeChatFactory()
    assert not MembreGroupe.objects.filter(groupe=groupe, membre=m1).exists()

    async def run():
        communicator, connected = await _connect(f"/ws/groupes/{groupe.id}/", m1.user)
        assert connected is False  # pas encore membre -> refusé
        await communicator.disconnect()

    asyncio.run(run())
    assert not MembreGroupe.objects.filter(groupe=groupe, membre=m1).exists()

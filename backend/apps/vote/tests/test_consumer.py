"""
Tests — VoteConsumer (WebSocket). Pas de pytest-asyncio dans ce projet (voir
requirements/dev.txt) : chaque test synchrone pilote sa propre coroutine via
`asyncio.run(...)`, seule dépendance requise étant `channels.testing`
(déjà présente via `channels` — voir requirements/base.txt).

`django_db(transaction=True)` : les accès ORM du consumer passent par
`channels.db.database_sync_to_async`, qui exécute le code de base de données dans un
thread séparé de la boucle asyncio — nécessite une vraie transaction validée en base
(comme pour tout test Channels touchant l'ORM), pas la transaction de test habituelle
que pytest-django annule en mémoire.
`serialized_rollback=True` (ajouté le 2026-09-23, apps.rbac) : sans ce flag, le FLUSH complet de
la base effectué après chaque test `transaction=True` efface aussi les lignes seedées par les
migrations de données (ex. apps.rbac.migrations.0002 — les 5 RoleDefinition système), sans les
recréer, ce qui casse tous les tests exécutés après celui-ci dans la même session pytest."""

import asyncio

import pytest
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.ws_auth import JWTAuthMiddlewareStack
from apps.vote.models import (
    ChoixExprime,
    ModeAnonymat,
    ParticipationVote,
    StatutSession,
    VoteExprime,
)
from apps.vote.routing import websocket_urlpatterns
from apps.vote.tests.factories import VoteOptionFactory, VoteSessionFactory, user_membre_avec_fiche

pytestmark = pytest.mark.django_db(transaction=True, serialized_rollback=True)


def _application():
    return JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns))


async def _connect(session, user):
    token = str(AccessToken.for_user(user))
    communicator = WebsocketCommunicator(_application(), f"/ws/votes/{session.id}/?token={token}")
    connected, _ = await communicator.connect()
    return communicator, connected


def test_connexion_refusee_sans_authentification():
    async def run():
        communicator = WebsocketCommunicator(
            _application(), "/ws/votes/00000000-0000-0000-0000-000000000000/"
        )
        connected, _ = await communicator.connect()
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_connexion_acceptee_et_recoit_etat_participation():
    session = VoteSessionFactory()
    VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws1@example.de")

    async def run():
        communicator, connected = await _connect(session, membre.user)
        assert connected is True
        message = await communicator.receive_json_from()
        assert message["type"] == "participation_update"
        assert message["total_participants"] == 0
        await communicator.disconnect()

    asyncio.run(run())


def test_vote_soumis_est_enregistre_et_diffuse_la_participation():
    session = VoteSessionFactory()
    option = VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws2@example.de")

    async def run():
        communicator, _ = await _connect(session, membre.user)
        await communicator.receive_json_from()  # état initial

        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})

        ack = await communicator.receive_json_from()
        assert ack == {"type": "vote_enregistre"}

        broadcast = await communicator.receive_json_from()
        assert broadcast["type"] == "participation_update"
        assert broadcast["total_participants"] == 1

        await communicator.disconnect()

    asyncio.run(run())

    assert VoteExprime.objects.filter(session=session).count() == 1
    assert ChoixExprime.objects.filter(bulletin__session=session, option=option).count() == 1


def test_double_vote_refuse():
    session = VoteSessionFactory()
    option = VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws3@example.de")

    async def run():
        communicator, _ = await _connect(session, membre.user)
        await communicator.receive_json_from()

        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})
        await communicator.receive_json_from()  # ack
        await communicator.receive_json_from()  # broadcast

        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})
        erreur = await communicator.receive_json_from()
        assert erreur["type"] == "erreur"

        await communicator.disconnect()

    asyncio.run(run())
    assert VoteExprime.objects.filter(session=session).count() == 1


def test_mode_anonyme_ne_cree_aucune_participation_nominative():
    session = VoteSessionFactory(mode_anonymat=ModeAnonymat.ANONYME)
    option = VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws4@example.de")

    async def run():
        communicator, _ = await _connect(session, membre.user)
        await communicator.receive_json_from()
        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})
        await communicator.receive_json_from()
        await communicator.receive_json_from()
        await communicator.disconnect()

    asyncio.run(run())
    assert ParticipationVote.objects.filter(session=session).count() == 0
    assert VoteExprime.objects.filter(session=session).count() == 1


def test_mode_nominatif_cree_une_participation_sans_le_choix():
    session = VoteSessionFactory(mode_anonymat=ModeAnonymat.NOMINATIF)
    option = VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws5@example.de")

    async def run():
        communicator, _ = await _connect(session, membre.user)
        await communicator.receive_json_from()
        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})
        await communicator.receive_json_from()
        await communicator.receive_json_from()
        await communicator.disconnect()

    asyncio.run(run())
    participation = ParticipationVote.objects.get(session=session, membre=membre)
    # ParticipationVote ne porte aucun champ de choix — vérifié structurellement.
    champs = {f.name for f in ParticipationVote._meta.get_fields()}
    assert "option" not in champs
    assert "choix" not in champs
    assert participation is not None


def test_vote_avec_session_fermee_refuse():
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    option = VoteOptionFactory(session=session)
    _, membre = user_membre_avec_fiche(email="ws6@example.de")

    async def run():
        communicator, _ = await _connect(session, membre.user)
        await communicator.receive_json_from()
        await communicator.send_json_to({"type": "voter", "choix": [str(option.id)]})
        erreur = await communicator.receive_json_from()
        assert erreur["type"] == "erreur"
        await communicator.disconnect()

    asyncio.run(run())
    assert VoteExprime.objects.filter(session=session).count() == 0

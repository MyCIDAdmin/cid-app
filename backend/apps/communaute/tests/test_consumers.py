"""
Tests — MessagerieConsumer / GroupeChatConsumer / LiveMatchConsumer (WebSocket, Phase 4B
pour ce dernier). Même principe que apps.vote.tests.test_consumer (voir son docstring) :
pas de pytest-asyncio dans ce projet,
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
from apps.communaute.models import (
    Conversation,
    MatchCommentaire,
    MatchReaction,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
)
from apps.communaute.routing import websocket_urlpatterns
from apps.communaute.tests.factories import (
    GroupeChatFactory,
    MatchFactory,
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


def test_suppression_dun_message_prive_par_lapi_rest_est_diffusee_au_websocket():
    """La suppression d'un message privé passe par MessagePriveViewSet (REST, expéditeur
    uniquement — voir apps.communaute.permissions.MessagePrivePermission), jamais par le
    WebSocket lui-même. Ce test appelle directement `views._broadcast_message_supprime`
    (même principe que test_mise_a_jour_du_score_par_lapi_rest_est_diffusee_au_websocket
    pour LiveMatchConsumer) pour vérifier que l'autre participant, connecté à la
    conversation, voit le message disparaître en temps réel."""
    _, m1 = user_membre_avec_fiche(email="msg12@example.de")
    _, m2 = user_membre_avec_fiche(email="msg13@example.de")
    conversation = Conversation.get_or_create_entre(m1, m2)
    message = MessagePrive.objects.create(conversation=conversation, expediteur=m1, contenu="Oups")

    async def run():
        communicator, connected = await _connect(f"/ws/messagerie/{conversation.id}/", m2.user)
        assert connected is True

        from channels.db import database_sync_to_async

        from apps.communaute.views import _broadcast_message_supprime

        await database_sync_to_async(_broadcast_message_supprime)(
            f"messagerie_{conversation.id}", str(message.id)
        )
        recu = await communicator.receive_json_from()
        assert recu == {"type": "message_supprime", "id": str(message.id)}

        await communicator.disconnect()

    asyncio.run(run())


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


def test_envoi_dun_message_de_groupe_declenche_la_notification(monkeypatch):
    """Ajouté le 2026-09-16 (retour utilisateur : couverture "Messaging und Austausch
    Module") — contrairement à MessagerieConsumer, aucune vérification de présence :
    GroupeChatConsumer notifie systématiquement les autres membres du groupe (voir
    tasks.envoyer_notification_message_groupe)."""
    _, m1 = user_membre_avec_fiche(email="grp3@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=m1)

    appels = []
    monkeypatch.setattr(
        "apps.communaute.tasks.envoyer_notification_message_groupe.delay",
        lambda *args, **kwargs: appels.append(args),
    )

    async def run():
        communicator, _ = await _connect(f"/ws/groupes/{groupe.id}/", m1.user)
        await communicator.send_json_to({"type": "message", "contenu": "Salut le groupe !"})
        await communicator.receive_json_from()
        await communicator.disconnect()

    asyncio.run(run())
    assert len(appels) == 1
    assert appels[0] == (str(groupe.id), str(m1.id))


def test_suppression_dun_message_de_groupe_par_lapi_rest_est_diffusee_au_websocket():
    """Même principe que le test équivalent pour MessagerieConsumer ci-dessus, côté
    GroupeChatConsumer."""
    _, m1 = user_membre_avec_fiche(email="grp4@example.de")
    groupe = GroupeChatFactory()
    MembreGroupeFactory(groupe=groupe, membre=m1)
    message = MessageGroupe.objects.create(groupe=groupe, auteur=m1, contenu="Oups")

    async def run():
        communicator, connected = await _connect(f"/ws/groupes/{groupe.id}/", m1.user)
        assert connected is True

        from channels.db import database_sync_to_async

        from apps.communaute.views import _broadcast_message_supprime

        await database_sync_to_async(_broadcast_message_supprime)(
            f"groupe_{groupe.id}", str(message.id)
        )
        recu = await communicator.receive_json_from()
        assert recu == {"type": "message_supprime", "id": str(message.id)}

        await communicator.disconnect()

    asyncio.run(run())


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


# --- LiveMatchConsumer (Phase 4B) ---


def test_connexion_live_refusee_sans_authentification():
    async def run():
        communicator = WebsocketCommunicator(
            _application(), "/ws/live/00000000-0000-0000-0000-000000000000/"
        )
        connected, _ = await communicator.connect()
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_connexion_live_refusee_si_match_introuvable():
    _, m1 = user_membre_avec_fiche(email="live1@example.de")

    async def run():
        communicator, connected = await _connect(
            "/ws/live/00000000-0000-0000-0000-000000000000/", m1.user
        )
        assert connected is False
        await communicator.disconnect()

    asyncio.run(run())


def test_connexion_live_acceptee_pour_tout_membre_authentifie():
    # Pas de contrôle d'appartenance (contrairement à GroupeChatConsumer) — Live Match est
    # ouvert à tout membre authentifié, voir docstring de tête models.py.
    _, m1 = user_membre_avec_fiche(email="live2@example.de")
    match = MatchFactory()

    async def run():
        communicator, connected = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected is True
        recu = await communicator.receive_json_from()  # présence à la connexion
        assert recu == {"type": "presence", "connectes": 1}
        await communicator.disconnect()

    asyncio.run(run())
    cache.clear()


def test_envoi_dun_commentaire_live_est_enregistre_et_diffuse():
    _, m1 = user_membre_avec_fiche(email="live3@example.de")
    match = MatchFactory()

    async def run():
        communicator, connected = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected is True
        await communicator.receive_json_from()  # présence

        await communicator.send_json_to({"type": "commentaire", "contenu": "Allez le CA !"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "commentaire"
        assert recu["contenu"] == "Allez le CA !"
        assert recu["auteur"]["id"] == str(m1.id)

        await communicator.disconnect()

    asyncio.run(run())
    assert MatchCommentaire.objects.filter(match=match).count() == 1
    cache.clear()


def test_envoi_dune_reaction_diffuse_les_compteurs_agreges():
    _, m1 = user_membre_avec_fiche(email="live4@example.de")
    match = MatchFactory()

    async def run():
        communicator, connected = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected is True
        await communicator.receive_json_from()  # présence

        await communicator.send_json_to({"type": "reaction", "emoji": "coeur"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "reaction"
        assert recu["reactions"]["coeur"] == 1
        assert recu["reactions"]["feu"] == 0

        await communicator.send_json_to({"type": "reaction", "emoji": "coeur"})
        recu = await communicator.receive_json_from()
        assert recu["reactions"]["coeur"] == 2

        await communicator.disconnect()

    asyncio.run(run())
    assert MatchReaction.objects.filter(match=match, emoji="coeur").count() == 2
    cache.clear()


def test_reaction_avec_emoji_invalide_est_rejetee():
    _, m1 = user_membre_avec_fiche(email="live5@example.de")
    match = MatchFactory()

    async def run():
        communicator, connected = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected is True
        await communicator.receive_json_from()  # présence

        await communicator.send_json_to({"type": "reaction", "emoji": "licorne"})
        recu = await communicator.receive_json_from()
        assert recu["type"] == "erreur"

        await communicator.disconnect()

    asyncio.run(run())
    assert MatchReaction.objects.filter(match=match).count() == 0
    cache.clear()


def test_compteur_de_presence_incremente_et_decremente_avec_les_connexions():
    _, m1 = user_membre_avec_fiche(email="live6@example.de")
    _, m2 = user_membre_avec_fiche(email="live7@example.de")
    match = MatchFactory()

    async def run():
        com1, connected1 = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected1 is True
        recu1 = await com1.receive_json_from()
        assert recu1 == {"type": "presence", "connectes": 1}

        com2, connected2 = await _connect(f"/ws/live/{match.id}/", m2.user)
        assert connected2 is True
        # com1 est aussi notifié de l'arrivée du deuxième membre connecté.
        recu1_bis = await com1.receive_json_from()
        assert recu1_bis == {"type": "presence", "connectes": 2}
        recu2 = await com2.receive_json_from()
        assert recu2 == {"type": "presence", "connectes": 2}

        await com2.disconnect()
        recu1_ter = await com1.receive_json_from()
        assert recu1_ter == {"type": "presence", "connectes": 1}

        await com1.disconnect()

    asyncio.run(run())
    cache.clear()


def test_mise_a_jour_du_score_par_lapi_rest_est_diffusee_au_websocket():
    """Le score/chrono/statut sont modifiés via MatchViewSet (REST, Bureau Admin+), jamais
    par le WebSocket lui-même — voir docstring de tête models.py. Ce test appelle
    directement `MatchViewSet._broadcast_match_update` (plutôt que de passer par
    APIClient, non disponible dans ce fichier orienté Channels) pour vérifier que le
    mécanisme de diffusion REST -> WS fonctionne réellement."""
    _, m1 = user_membre_avec_fiche(email="live8@example.de")
    match = MatchFactory(score_ca=0, score_adversaire=0)

    async def run():
        communicator, connected = await _connect(f"/ws/live/{match.id}/", m1.user)
        assert connected is True
        await communicator.receive_json_from()  # présence

        from channels.db import database_sync_to_async

        from apps.communaute.views import MatchViewSet

        match.score_ca = 1
        await database_sync_to_async(match.save)(update_fields=["score_ca"])
        await database_sync_to_async(MatchViewSet._broadcast_match_update)(match)

        recu = await communicator.receive_json_from()
        assert recu["type"] == "match"
        assert recu["score_ca"] == 1

        await communicator.disconnect()

    asyncio.run(run())
    cache.clear()

"""
Consumers WebSocket — app communaute, lot Messagerie privée + Groupes de chat (Release Plan
§3.2). Réutilisent l'infrastructure Django Channels installée en Phase 3 pour apps.vote
(JWTAuthMiddlewareStack déjà branché sur config/asgi.py — voir apps.accounts.ws_auth) et
suivent le même découpage WS/REST que `apps.vote.consumers.VoteConsumer` : la mutation en
temps réel (envoyer un message) passe UNIQUEMENT par `receive_json`, jamais par un endpoint
REST équivalent — REST (views.py) ne sert que l'historique/la liste.

ws://app/ws/messagerie/{conversation_id}/?token=JWT
ws://app/ws/groupes/{groupe_id}/?token=JWT

Présence "en ligne" (MessagerieConsumer uniquement, pour la notification email si hors
ligne — CID-SCD-001 §résumé "Messagerie privée") : une clé de cache Redis scoped PAR
CONVERSATION (`communaute:messagerie:en_ligne:{conversation_id}:{membre_id}`), posée à la
connexion et retirée à la déconnexion, avec un TTL de sécurité (5 min) au cas où
`disconnect()` ne serait jamais appelé (crash réseau). "Hors ligne" signifie ici "pas
connecté au WebSocket de CETTE conversation précise", pas un statut de présence globale —
lecture volontairement étroite du périmètre documenté (voir docstring de tête models.py).

Aucun suivi de présence pour `GroupeChatConsumer` : le compteur "X en ligne" du mockup est
une fonctionnalité de démonstration, absente des bullets fonctionnels du FDD/Release Plan
pour Groupes de chat — délibérément hors périmètre (voir CLAUDE.md/notes de session). Sa
notification in-app (ajoutée le 2026-09-16, `tasks.envoyer_notification_message_groupe`)
notifie donc systématiquement tous les autres membres du groupe, sans condition de présence
— contrairement à `MessagerieConsumer` ci-dessous, dont la notification ne se déclenche que
si l'autre participant n'est PAS connecté à la conversation.

ws://app/ws/live/{match_id}/?token=JWT — LiveMatchConsumer (troisième lot, Phase 4B, voir
docstring de tête models.py) : SEUL consumer de ce fichier à combiner mutation temps réel
ET diffusion d'une mise à jour déclenchée côté REST — le score/chrono/statut d'un match sont
modifiés exclusivement par `MatchViewSet` (Bureau Admin+, jamais par le WebSocket lui-même,
même logique que "rejoindre un groupe est une action REST" pour `GroupeChatConsumer") puis
diffusés au groupe `live_{match_id}` via `channel_layer.group_send(..., {"type":
"match_update", ...})`, appelé depuis la vue — même mécanisme que
`apps.vote.views.VoteSessionViewSet._broadcast_resultats`. Commentaires et réactions emoji,
eux, suivent le pattern WS-only habituel de ce module (`receive_json`). Présence "membres
connectés" (mockup) : compteur agrégé (pas une présence par conversation comme
`MessagerieConsumer`) via `cache.incr`/`cache.decr` sur une clé unique par match, TTL de
sécurité volontairement long (`PRESENCE_TTL_LIVE`, 4h) car un match dure largement plus
longtemps qu'une conversation de messagerie."""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.core.cache import cache
from django.db.models import Count

from .models import (
    Conversation,
    GroupeChat,
    Match,
    MatchCommentaire,
    MatchReaction,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    TypeReactionMatch,
)

PRESENCE_TTL = 300  # secondes — filet de sécurité si disconnect() n'est jamais appelé
PRESENCE_TTL_LIVE = 4 * 60 * 60  # 4h — un match dure bien plus longtemps qu'une conversation


def _cle_presence(conversation_id, membre_id):
    return f"communaute:messagerie:en_ligne:{conversation_id}:{membre_id}"


class MessagerieConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.group_name = f"messagerie_{self.conversation_id}"

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        # `user.membre` est une relation inverse (OneToOne) — jamais résolue en dehors
        # de `database_sync_to_async` (elle déclenche une requête ORM synchrone, interdite
        # directement dans une coroutine, contrairement à `user.is_authenticated` qui ne
        # touche pas la base). Voir même piège évité dans GroupeChatConsumer.connect().
        membre_id = await self._get_membre_id(user)
        if membre_id is None:
            await self.close(code=4001)
            return
        self.membre_id = membre_id

        conversation = await self._get_conversation()
        if conversation is None or not await self._est_participant(conversation):
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        cache.set(_cle_presence(self.conversation_id, self.membre_id), True, timeout=PRESENCE_TTL)

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "membre_id"):
            cache.delete(_cle_presence(self.conversation_id, self.membre_id))

    async def receive_json(self, content, **kwargs):
        type_message = content.get("type")

        if type_message == "message":
            contenu = (content.get("contenu") or "").strip()
            if not contenu:
                return
            message = await self._creer_message(contenu)
            if message is None:
                await self.send_json({"type": "erreur", "message": "Conversation introuvable."})
                return
            payload = {
                "id": str(message.id),
                "conversation": str(self.conversation_id),
                "expediteur": str(self.membre_id),
                "contenu": contenu,
                "est_lu": False,
                "created_at": message.created_at.isoformat(),
            }
            await self.channel_layer.group_send(
                self.group_name, {"type": "message_recu", "payload": payload}
            )
            await self._notifier_si_hors_ligne(contenu)
            return

        if type_message == "lu":
            await self._marquer_lu()
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "lecture_update",
                    "payload": {
                        "conversation": str(self.conversation_id),
                        "lu_par": str(self.membre_id),
                    },
                },
            )
            return

    # --- handlers de groupe ---

    async def message_recu(self, event):
        await self.send_json({"type": "message", **event["payload"]})

    async def lecture_update(self, event):
        await self.send_json({"type": "lu", **event["payload"]})

    async def message_supprime(self, event):
        # Diffusé depuis MessagePriveViewSet.perform_destroy (REST — suppression réservée à
        # l'expéditeur, voir apps.communaute.permissions.MessagePrivePermission), même
        # mécanisme REST -> WS que LiveMatchConsumer.match_update.
        await self.send_json({"type": "message_supprime", **event["payload"]})

    # --- accès base de données ---

    @database_sync_to_async
    def _get_membre_id(self, user):
        from apps.membres.models import Membre

        return Membre.objects.filter(user=user).values_list("id", flat=True).first()

    @database_sync_to_async
    def _get_conversation(self):
        return Conversation.objects.filter(id=self.conversation_id).first()

    @database_sync_to_async
    def _est_participant(self, conversation):
        return self.membre_id in (conversation.membre_a_id, conversation.membre_b_id)

    @database_sync_to_async
    def _creer_message(self, contenu):
        conversation = Conversation.objects.filter(id=self.conversation_id).first()
        if conversation is None:
            return None
        return MessagePrive.objects.create(
            conversation=conversation, expediteur_id=self.membre_id, contenu=contenu
        )

    @database_sync_to_async
    def _marquer_lu(self):
        MessagePrive.objects.filter(conversation_id=self.conversation_id, est_lu=False).exclude(
            expediteur_id=self.membre_id
        ).update(est_lu=True)

    @database_sync_to_async
    def _autre_participant_hors_ligne_et_infos(self):
        conversation = (
            Conversation.objects.select_related("membre_a", "membre_b")
            .filter(id=self.conversation_id)
            .first()
        )
        if conversation is None:
            return None
        membre_courant = (
            conversation.membre_a
            if conversation.membre_a_id == self.membre_id
            else conversation.membre_b
        )
        autre = conversation.autre_participant(membre_courant)
        return autre.id, f"{membre_courant.prenom} {membre_courant.nom}".strip()

    async def _notifier_si_hors_ligne(self, contenu):
        infos = await self._autre_participant_hors_ligne_et_infos()
        if infos is None:
            return
        autre_membre_id, expediteur_nom = infos
        if cache.get(_cle_presence(self.conversation_id, autre_membre_id)):
            return  # l'autre participant est connecté à cette conversation -> pas d'email
        from .tasks import envoyer_notification_message_prive

        envoyer_notification_message_prive.delay(
            str(autre_membre_id), expediteur_nom, str(self.conversation_id)
        )


class GroupeChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.groupe_id = self.scope["url_route"]["kwargs"]["groupe_id"]
        self.group_name = f"groupe_{self.groupe_id}"

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        membre_id = await self._get_membre_id(user)
        if membre_id is None:
            await self.close(code=4001)
            return
        self.membre_id = membre_id

        # Rejoindre est une action REST explicite (voir GroupeChatViewSet.rejoindre) — la
        # connexion WebSocket ne crée jamais d'appartenance elle-même (handshake sans effet
        # de bord métier).
        est_membre = await self._est_membre()
        if not est_membre:
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") != "message":
            return
        contenu = (content.get("contenu") or "").strip()
        if not contenu:
            return
        message = await self._creer_message(contenu)
        if message is None:
            await self.send_json({"type": "erreur", "message": "Groupe introuvable."})
            return
        auteur = await self._auteur_infos()
        payload = {
            "id": str(message.id),
            "groupe": str(self.groupe_id),
            "auteur": auteur,
            "contenu": contenu,
            "created_at": message.created_at.isoformat(),
        }
        await self.channel_layer.group_send(
            self.group_name, {"type": "message_recu", "payload": payload}
        )

        from .tasks import envoyer_notification_message_groupe

        envoyer_notification_message_groupe.delay(str(self.groupe_id), str(self.membre_id))

    async def message_recu(self, event):
        await self.send_json({"type": "message", **event["payload"]})

    async def message_supprime(self, event):
        # Diffusé depuis MessageGroupeViewSet.perform_destroy — même mécanisme que
        # MessagerieConsumer.message_supprime ci-dessus.
        await self.send_json({"type": "message_supprime", **event["payload"]})

    @database_sync_to_async
    def _get_membre_id(self, user):
        from apps.membres.models import Membre

        return Membre.objects.filter(user=user).values_list("id", flat=True).first()

    @database_sync_to_async
    def _est_membre(self):
        return MembreGroupe.objects.filter(
            groupe_id=self.groupe_id, membre_id=self.membre_id
        ).exists()

    @database_sync_to_async
    def _creer_message(self, contenu):
        groupe = GroupeChat.objects.filter(id=self.groupe_id).first()
        if groupe is None:
            return None
        return MessageGroupe.objects.create(
            groupe=groupe, auteur_id=self.membre_id, contenu=contenu
        )

    @database_sync_to_async
    def _auteur_infos(self):
        from apps.membres.models import Membre

        membre = Membre.objects.filter(id=self.membre_id).first()
        if membre is None:
            return {"id": str(self.membre_id)}
        return {
            "id": str(membre.id),
            "prenom": membre.prenom,
            "nom": membre.nom,
            "photo": membre.photo.url if membre.photo else None,
        }


def _cle_presence_live(match_id):
    return f"communaute:live:connectes:{match_id}"


class LiveMatchConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.match_id = self.scope["url_route"]["kwargs"]["match_id"]
        self.group_name = f"live_{self.match_id}"

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        membre_id = await self._get_membre_id(user)
        if membre_id is None:
            await self.close(code=4001)
            return
        self.membre_id = membre_id

        if not await self._match_existe():
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        connectes = await self._incrementer_presence()
        await self.channel_layer.group_send(
            self.group_name, {"type": "presence_update", "payload": {"connectes": connectes}}
        )

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "membre_id"):
            connectes = await self._decrementer_presence()
            channel_layer = self.channel_layer
            if channel_layer is not None:
                await channel_layer.group_send(
                    self.group_name,
                    {"type": "presence_update", "payload": {"connectes": connectes}},
                )

    async def receive_json(self, content, **kwargs):
        type_message = content.get("type")

        if type_message == "commentaire":
            contenu = (content.get("contenu") or "").strip()
            if not contenu:
                return
            commentaire = await self._creer_commentaire(contenu)
            if commentaire is None:
                await self.send_json({"type": "erreur", "message": "Match introuvable."})
                return
            auteur = await self._auteur_infos()
            payload = {
                "id": str(commentaire.id),
                "match": str(self.match_id),
                "auteur": auteur,
                "contenu": contenu,
                "created_at": commentaire.created_at.isoformat(),
            }
            await self.channel_layer.group_send(
                self.group_name, {"type": "commentaire_recu", "payload": payload}
            )
            return

        if type_message == "reaction":
            emoji = content.get("emoji")
            if emoji not in TypeReactionMatch.values:
                await self.send_json({"type": "erreur", "message": "Emoji invalide."})
                return
            reussi = await self._creer_reaction(emoji)
            if not reussi:
                await self.send_json({"type": "erreur", "message": "Match introuvable."})
                return
            compteurs = await self._compteurs_reactions()
            await self.channel_layer.group_send(
                self.group_name, {"type": "reaction_recue", "payload": {"reactions": compteurs}}
            )
            return

    # --- handlers de groupe ---

    async def commentaire_recu(self, event):
        await self.send_json({"type": "commentaire", **event["payload"]})

    async def reaction_recue(self, event):
        await self.send_json({"type": "reaction", **event["payload"]})

    async def presence_update(self, event):
        await self.send_json({"type": "presence", **event["payload"]})

    async def match_update(self, event):
        # Diffusé depuis MatchViewSet (REST — score/chrono/statut modifiés par un
        # modérateur), voir docstring de tête.
        await self.send_json({"type": "match", **event["payload"]})

    async def match_evenement(self, event):
        # Module Fan-Club (2026-09-24) — diffusé depuis MatchEvenementViewSet (REST, ajout
        # d'un but/carton par un modérateur), voir views.py
        # ::MatchEvenementViewSet._broadcast_match_evenement. Même mécanisme REST -> WS que
        # match_update ci-dessus, groupe séparé conceptuellement (payload différent) mais
        # même canal `live_{match_id}`.
        await self.send_json({"type": "match_evenement", **event["payload"]})

    # --- accès base de données ---

    @database_sync_to_async
    def _get_membre_id(self, user):
        from apps.membres.models import Membre

        return Membre.objects.filter(user=user).values_list("id", flat=True).first()

    @database_sync_to_async
    def _match_existe(self):
        return Match.objects.filter(id=self.match_id).exists()

    @database_sync_to_async
    def _creer_commentaire(self, contenu):
        match = Match.objects.filter(id=self.match_id).first()
        if match is None:
            return None
        return MatchCommentaire.objects.create(
            match=match, auteur_id=self.membre_id, contenu=contenu
        )

    @database_sync_to_async
    def _creer_reaction(self, emoji):
        match = Match.objects.filter(id=self.match_id).first()
        if match is None:
            return False
        MatchReaction.objects.create(match=match, membre_id=self.membre_id, emoji=emoji)
        return True

    @database_sync_to_async
    def _compteurs_reactions(self):
        compteurs = {valeur: 0 for valeur in TypeReactionMatch.values}
        qs = (
            MatchReaction.objects.filter(match_id=self.match_id)
            .values("emoji")
            .annotate(total=Count("id"))
        )
        for ligne in qs:
            compteurs[ligne["emoji"]] = ligne["total"]
        return compteurs

    @database_sync_to_async
    def _auteur_infos(self):
        from apps.membres.models import Membre

        membre = Membre.objects.filter(id=self.membre_id).first()
        if membre is None:
            return {"id": str(self.membre_id)}
        return {
            "id": str(membre.id),
            "prenom": membre.prenom,
            "nom": membre.nom,
            "photo": membre.photo.url if membre.photo else None,
        }

    # --- présence (compteur agrégé, voir docstring de tête) ---

    @database_sync_to_async
    def _incrementer_presence(self):
        cle = _cle_presence_live(self.match_id)
        cache.add(cle, 0, timeout=PRESENCE_TTL_LIVE)
        try:
            return cache.incr(cle)
        except ValueError:
            # La clé a expiré entre le add() et l'incr() (filet de sécurité) — on
            # réinitialise à 1 (cette connexion) plutôt que d'échouer.
            cache.set(cle, 1, timeout=PRESENCE_TTL_LIVE)
            return 1

    @database_sync_to_async
    def _decrementer_presence(self):
        cle = _cle_presence_live(self.match_id)
        try:
            valeur = cache.decr(cle)
        except ValueError:
            valeur = 0
        if valeur < 0:
            cache.set(cle, 0, timeout=PRESENCE_TTL_LIVE)
            valeur = 0
        return valeur

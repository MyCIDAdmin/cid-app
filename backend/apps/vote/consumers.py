"""
Consumer WebSocket — app vote (SDD §2.3, Timeline Phase 3 "WebSocket Consumer VoteConsumer
(Django Channels + Redis pub/sub)").

ws://app/ws/votes/{session_id}/?token=JWT

Authentification : apps.accounts.ws_auth.JWTAuthMiddlewareStack (déjà branché sur
config/asgi.py depuis la Phase 0) peuple scope["user"] à partir du token de la query
string — ce module ne refait pas cette vérification, il vérifie seulement que
scope["user"] est authentifié.

Cycle de vie :
  connect()    — vérifie l'authentification + l'existence de la session, rejoint le groupe
                 Channels `vote_{session_id}`, envoie l'état courant (participation live).
  receive_json — seul message client géré : {"type": "voter", "choix": [<option_id>, ...]}.
                 Calcule voter_token, vérifie l'absence de doublon, insère VoteExprime +
                 ChoixExprime en une transaction atomique, puis diffuse
                 `participation_update` à tout le groupe (SDD §2.3 : "Broadcast Redis
                 pub/sub → tous les connectés reçoivent participation_update (% live)").
  disconnect() — quitte le groupe.

Aucune donnée renvoyée au votant (succès ou erreur) ne révèle jamais le nombre de votes
déjà exprimés par option, ni aucune information sur les autres votants — uniquement un
accusé de réception ou un message d'erreur de validation (déjà voté / session close /
choix invalide)."""

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.db import IntegrityError, transaction

from .models import ChoixExprime, ModeAnonymat, ParticipationVote, StatutSession, VoteExprime
from .security import compute_voter_token
from .services import participation_payload, valider_choix_pour_type


class VoteConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.session_id = self.scope["url_route"]["kwargs"]["session_id"]
        self.group_name = f"vote_{self.session_id}"

        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        session = await self._get_session()
        if session is None:
            await self.close(code=4004)
            return

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json(await self._participation_payload(session))

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") != "voter":
            return

        user = self.scope.get("user")
        choix_ids = content.get("choix") or []

        try:
            result = await self._enregistrer_vote(user, choix_ids)
        except ValueError as exc:
            await self.send_json({"type": "erreur", "message": str(exc)})
            return

        if result == "deja_vote":
            await self.send_json(
                {"type": "erreur", "message": "Vous avez déjà voté pour cette session."}
            )
            return
        if result == "session_close":
            await self.send_json({"type": "erreur", "message": "Cette session n'est plus ouverte."})
            return

        await self.send_json({"type": "vote_enregistre"})

        session = await self._get_session()
        if session is not None:
            payload = await self._participation_payload(session)
            await self.channel_layer.group_send(
                self.group_name, {"type": "participation_update", "payload": payload}
            )

    # --- handlers de groupe (dispatch Channels sur `type`) ---

    async def participation_update(self, event):
        await self.send_json(event["payload"])

    async def resultats_disponibles(self, event):
        await self.send_json({"type": "resultats_disponibles", "resultats": event["payload"]})

    # --- accès base de données (toujours sync -> async) ---

    @database_sync_to_async
    def _get_session(self):
        from .models import VoteSession

        return VoteSession.objects.filter(id=self.session_id).first()

    @database_sync_to_async
    def _participation_payload(self, session):
        return participation_payload(session)

    @database_sync_to_async
    def _enregistrer_vote(self, user, choix_ids):
        from .models import VoteSession

        session = VoteSession.objects.filter(id=self.session_id).first()
        if session is None or session.statut != StatutSession.OUVERTE:
            return "session_close"

        valider_choix_pour_type(session.type_vote, choix_ids, session.nb_choix_max)

        membre = getattr(user, "membre", None)
        if membre is None:
            raise ValueError("Aucune fiche membre associée à ce compte utilisateur.")

        token_hash = compute_voter_token(membre.id, session.id, session.anonymat_sel)

        if VoteExprime.objects.filter(session=session, voter_token_hash=token_hash).exists():
            return "deja_vote"

        options = list(session.options.filter(id__in=choix_ids))
        if len(options) != len(set(choix_ids)):
            raise ValueError("Une ou plusieurs options sélectionnées sont invalides.")

        try:
            with transaction.atomic():
                bulletin = VoteExprime.objects.create(session=session, voter_token_hash=token_hash)
                ChoixExprime.objects.bulk_create(
                    [ChoixExprime(bulletin=bulletin, option=option) for option in options]
                )
                if session.mode_anonymat == ModeAnonymat.NOMINATIF:
                    ParticipationVote.objects.get_or_create(session=session, membre=membre)
        except IntegrityError:
            # Course entre deux requêtes concurrentes du même membre : la contrainte
            # unique_voter_token_par_session protège malgré tout contre le double vote.
            return "deja_vote"

        return "ok"

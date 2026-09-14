"""
Vues API — app communaute, lot Fil d'actualité + Forum (Release Plan §3.2) :

  GET/POST   /communaute/publications/                 — fil d'actualité (lecture : tout
                                                           authentifié, publications non
                                                           masquées uniquement en dessous de
                                                           Bureau Admin — voir get_queryset)
  PATCH/DELETE /communaute/publications/{id}/           — propriétaire ou Bureau Admin+
  POST       /communaute/publications/{id}/liker/       — bascule like (toggle)
  POST       /communaute/publications/{id}/partager/    — bascule partage (toggle)
  POST       /communaute/publications/{id}/masquer/     — modération (Bureau Admin+),
                                                           journalisée (log_audit_event)
  POST/DELETE /communaute/commentaires/                 — commenter une publication (ou
                                                           répondre à un commentaire via
                                                           `parent`) ; pas de list/retrieve
                                                           dédiés, les commentaires sont
                                                           nichés dans PublicationSerializer
  POST       /communaute/commentaires/{id}/masquer/     — modération (Bureau Admin+)

  GET/POST   /communaute/sujets/                        — forum (mêmes règles de
                                                           visibilité que Publication)
  POST       /communaute/sujets/{id}/epingler/           — modération (bascule)
  POST       /communaute/sujets/{id}/verrouiller/        — modération (bascule)
  POST       /communaute/sujets/{id}/masquer/            — modération (soft-hide)
  POST/DELETE /communaute/reponses-forum/                — répondre à un sujet (bloqué si
                                                           `sujet.est_verrouille`)
  POST       /communaute/reponses-forum/{id}/masquer/    — modération (Bureau Admin+)

Journalisation (CID-SCD-001 §résumé "Forum / Fil — Modération uniquement") : seules les
actions de modération (masquer/épingler/verrouiller) appellent
`apps.accounts.services.log_audit_event` — les publications/commentaires/sujets/réponses
normaux ne sont volontairement PAS audités (pas plus que pour la Boutique), pour ne pas
journaliser l'activité sociale ordinaire des membres (minimisation RGPD, même doc §résumé).
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import ROLE_LEVELS
from apps.accounts.services import log_audit_event
from apps.membres.models import Membre

from .filters import PublicationFilter, SujetFilter
from .models import (
    Album,
    ChoixQuestion,
    Commentaire,
    Conversation,
    GroupeChat,
    Match,
    MatchCommentaire,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    ParticipationQuiz,
    Photo,
    PhotoCommentaire,
    PhotoLike,
    Publication,
    PublicationLike,
    PublicationPartage,
    Quiz,
    QuestionQuiz,
    ReponseForum,
    ReponseQuiz,
    Sujet,
)
from .permissions import (
    MODERATION_MIN_LEVEL,
    AlbumPermission,
    ContenuCommunautePermission,
    ConversationPermission,
    GestionQuizPermission,
    GroupeChatPermission,
    MatchCommentairePermission,
    MatchPermission,
    MessagePrivePermission,
    PhotoCommentairePermission,
    PhotoPermission,
    QuizPermission,
)
from .serializers import (
    AlbumSerializer,
    ChoixQuestionSerializer,
    CommentaireSerializer,
    ConversationSerializer,
    GroupeChatSerializer,
    MatchCommentaireSerializer,
    MatchSerializer,
    MessageGroupeSerializer,
    MessagePriveSerializer,
    ParticipationQuizSerializer,
    PhotoCommentaireSerializer,
    PhotoSerializer,
    PublicationSerializer,
    QuestionQuizSerializer,
    QuizSerializer,
    ReponseForumSerializer,
    ReponseQuizSerializer,
    SujetSerializer,
)


def _client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


class PublicationCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class SujetCursorPagination(CursorPagination):
    # Épinglés en tête (même ordre que Sujet.Meta.ordering) — "id" en dernier pour garantir
    # un tri strictement déterministe, requis par CursorPagination (même correctif que
    # apps.boutique.views.VarianteCursorPagination pour VarianteProduit).
    ordering = ("-est_epingle", "-created_at", "id")


class ConversationCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class MessagePriveCursorPagination(CursorPagination):
    ordering = ("created_at", "id")


class GroupeChatCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class MessageGroupeCursorPagination(CursorPagination):
    ordering = ("created_at", "id")


class PublicationViewSet(viewsets.ModelViewSet):
    serializer_class = PublicationSerializer
    permission_classes = [ContenuCommunautePermission]
    filterset_class = PublicationFilter
    filter_backends = [DjangoFilterBackend]
    pagination_class = PublicationCursorPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Publication.objects.select_related("auteur").prefetch_related(
            "hashtags",
            "likes",
            "partages",
            "commentaires__auteur",
            "commentaires__reponses__auteur",
        )
        user = self.request.user
        if ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL:
            return qs
        return qs.filter(est_masquee=False)

    @action(detail=True, methods=["post"])
    def liker(self, request, pk=None):
        publication = self.get_object()
        membre = request.user.membre
        like, cree = PublicationLike.objects.get_or_create(publication=publication, membre=membre)
        if not cree:
            like.delete()
        # get_queryset() prefetch_related("likes", ...) — l'instance porte encore le cache
        # de prefetch d'AVANT la création/suppression du like ci-dessus ; sans ce
        # refresh_from_db() (qui vide _prefetched_objects_cache), nombre_likes/jaime dans
        # la réponse refléteraient l'état précédent la bascule au lieu de l'état à jour.
        publication.refresh_from_db()
        return Response(self.get_serializer(publication).data)

    @action(detail=True, methods=["post"])
    def partager(self, request, pk=None):
        publication = self.get_object()
        membre = request.user.membre
        partage, cree = PublicationPartage.objects.get_or_create(
            publication=publication, membre=membre
        )
        if not cree:
            partage.delete()
        publication.refresh_from_db()  # même raison que liker() ci-dessus
        return Response(self.get_serializer(publication).data)

    @action(detail=True, methods=["post"])
    def masquer(self, request, pk=None):
        publication = self.get_object()
        motif = request.data.get("motif", "")
        publication.est_masquee = not publication.est_masquee
        publication.motif_masquage = motif if publication.est_masquee else ""
        publication.masquee_par = request.user if publication.est_masquee else None
        publication.save(update_fields=["est_masquee", "motif_masquage", "masquee_par"])
        log_audit_event(
            "publication_masquee" if publication.est_masquee else "publication_demasquee",
            user=request.user,
            ip_address=_client_ip(request),
            publication_id=str(publication.id),
            motif=motif,
        )
        return Response(self.get_serializer(publication).data)


class CommentaireViewSet(
    mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = CommentaireSerializer
    permission_classes = [ContenuCommunautePermission]
    queryset = Commentaire.objects.select_related("auteur", "publication")

    @action(detail=True, methods=["post"])
    def masquer(self, request, pk=None):
        commentaire = self.get_object()
        commentaire.est_masque = not commentaire.est_masque
        commentaire.save(update_fields=["est_masque"])
        log_audit_event(
            "commentaire_masque" if commentaire.est_masque else "commentaire_demasque",
            user=request.user,
            ip_address=_client_ip(request),
            commentaire_id=str(commentaire.id),
        )
        return Response(self.get_serializer(commentaire).data)


class SujetViewSet(viewsets.ModelViewSet):
    serializer_class = SujetSerializer
    permission_classes = [ContenuCommunautePermission]
    filterset_class = SujetFilter
    filter_backends = [DjangoFilterBackend]
    pagination_class = SujetCursorPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Sujet.objects.select_related("auteur").prefetch_related("reponses__auteur")
        user = self.request.user
        if ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL:
            return qs
        return qs.filter(est_masque=False)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["vue"] = "detail" if self.action == "retrieve" else "liste"
        return context

    @action(detail=True, methods=["post"])
    def epingler(self, request, pk=None):
        sujet = self.get_object()
        sujet.est_epingle = not sujet.est_epingle
        sujet.save(update_fields=["est_epingle"])
        log_audit_event(
            "sujet_epingle" if sujet.est_epingle else "sujet_desepingle",
            user=request.user,
            ip_address=_client_ip(request),
            sujet_id=str(sujet.id),
        )
        return Response(
            self.get_serializer(
                sujet, context={**self.get_serializer_context(), "vue": "detail"}
            ).data
        )

    @action(detail=True, methods=["post"])
    def verrouiller(self, request, pk=None):
        sujet = self.get_object()
        sujet.est_verrouille = not sujet.est_verrouille
        sujet.save(update_fields=["est_verrouille"])
        log_audit_event(
            "sujet_verrouille" if sujet.est_verrouille else "sujet_deverrouille",
            user=request.user,
            ip_address=_client_ip(request),
            sujet_id=str(sujet.id),
        )
        return Response(
            self.get_serializer(
                sujet, context={**self.get_serializer_context(), "vue": "detail"}
            ).data
        )

    @action(detail=True, methods=["post"])
    def masquer(self, request, pk=None):
        sujet = self.get_object()
        motif = request.data.get("motif", "")
        sujet.est_masque = not sujet.est_masque
        sujet.motif_masquage = motif if sujet.est_masque else ""
        sujet.masque_par = request.user if sujet.est_masque else None
        sujet.save(update_fields=["est_masque", "motif_masquage", "masque_par"])
        log_audit_event(
            "sujet_masque" if sujet.est_masque else "sujet_demasque",
            user=request.user,
            ip_address=_client_ip(request),
            sujet_id=str(sujet.id),
            motif=motif,
        )
        return Response(
            self.get_serializer(
                sujet, context={**self.get_serializer_context(), "vue": "detail"}
            ).data
        )


class ReponseForumViewSet(
    mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = ReponseForumSerializer
    permission_classes = [ContenuCommunautePermission]
    queryset = ReponseForum.objects.select_related("auteur", "sujet")

    def perform_create(self, serializer):
        sujet = get_object_or_404(Sujet, pk=self.request.data.get("sujet"))
        if sujet.est_verrouille:
            raise PermissionDenied("Ce sujet est verrouillé — impossible de répondre.")
        if sujet.est_masque:
            raise ValidationError({"sujet": "Sujet introuvable."})
        serializer.save()

    @action(detail=True, methods=["post"])
    def masquer(self, request, pk=None):
        reponse = self.get_object()
        reponse.est_masquee = not reponse.est_masquee
        reponse.save(update_fields=["est_masquee"])
        log_audit_event(
            "reponse_forum_masquee" if reponse.est_masquee else "reponse_forum_demasquee",
            user=request.user,
            ip_address=_client_ip(request),
            reponse_id=str(reponse.id),
        )
        return Response(self.get_serializer(reponse).data)


# ---------------------------------------------------------------------------
# Messagerie privée + Groupes de chat (deuxième lot) :
#
#   GET        /communaute/conversations/                 — mes conversations (aperçu +
#                                                             non-lus)
#   POST       /communaute/conversations/                 — {"destinataire": <membre_id>}
#                                                             démarre/retrouve la conversation
#   GET        /communaute/conversations/{id}/             — participant uniquement (IDOR)
#   GET        /communaute/messages-prives/?conversation=  — historique (participant
#                                                             uniquement) ; ENVOYER un
#                                                             message passe UNIQUEMENT par
#                                                             MessagerieConsumer (WebSocket)
#
#   GET/POST   /communaute/groupes/                        — liste (publics + les miens) /
#                                                             création
#   GET/DELETE /communaute/groupes/{id}/                   — createur/Bureau Admin+ pour
#                                                             DELETE
#   POST       /communaute/groupes/{id}/rejoindre/         — groupes publics uniquement
#   POST       /communaute/groupes/{id}/quitter/           — tout membre actuel
#   POST       /communaute/groupes/{id}/inviter/           — créateur/Bureau Admin+, ajoute
#                                                             des membres à un groupe privé
#   GET        /communaute/messages-groupe/?groupe=        — historique ; ENVOYER un message
#                                                             passe UNIQUEMENT par
#                                                             GroupeChatConsumer (WebSocket)
# ---------------------------------------------------------------------------


class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = ConversationSerializer
    permission_classes = [ConversationPermission]
    pagination_class = ConversationCursorPagination
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            return Conversation.objects.none()
        return Conversation.objects.filter(Q(membre_a=membre) | Q(membre_b=membre)).select_related(
            "membre_a", "membre_b"
        )

    def create(self, request, *args, **kwargs):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise PermissionDenied("Aucune fiche membre associée à ce compte.")
        destinataire_id = request.data.get("destinataire")
        if not destinataire_id:
            raise ValidationError({"destinataire": "Ce champ est requis."})
        destinataire = get_object_or_404(Membre, pk=destinataire_id)
        if destinataire.id == membre.id:
            raise ValidationError(
                {"destinataire": "Impossible de démarrer une conversation avec soi-même."}
            )
        conversation = Conversation.get_or_create_entre(membre, destinataire)
        serializer = self.get_serializer(conversation)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessagePriveViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Liste seule — l'envoi d'un message passe exclusivement par `MessagerieConsumer`
    (voir docstring de tête de consumers.py). `?conversation=<id>` est obligatoire."""

    serializer_class = MessagePriveSerializer
    permission_classes = [MessagePrivePermission]
    pagination_class = MessagePriveCursorPagination

    def get_queryset(self):
        conversation_id = self.request.query_params.get("conversation")
        if not conversation_id:
            raise ValidationError({"conversation": "Ce paramètre est requis."})
        membre = getattr(self.request.user, "membre", None)
        conversation = Conversation.objects.filter(id=conversation_id).first()
        if conversation is None or membre is None or not conversation.participant(membre):
            # 403 explicite plutôt qu'une liste vide silencieuse (voir docstring
            # permissions.MessagePrivePermission) — ne pas laisser un membre deviner
            # l'existence d'une conversation à laquelle il n'appartient pas.
            raise PermissionDenied("Vous n'êtes pas participant de cette conversation.")
        return MessagePrive.objects.filter(conversation=conversation).select_related("expediteur")


class GroupeChatViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = GroupeChatSerializer
    permission_classes = [GroupeChatPermission]
    pagination_class = GroupeChatCursorPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = GroupeChat.objects.select_related("createur").prefetch_related("membres_groupe")
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            return qs.filter(type_groupe="public")
        return qs.filter(Q(type_groupe="public") | Q(membres_groupe__membre=membre)).distinct()

    @action(detail=True, methods=["post"])
    def rejoindre(self, request, pk=None):
        groupe = self.get_object()
        membre = request.user.membre
        MembreGroupe.objects.get_or_create(groupe=groupe, membre=membre)
        return Response(self.get_serializer(groupe).data)

    @action(detail=True, methods=["post"])
    def quitter(self, request, pk=None):
        groupe = self.get_object()
        membre = request.user.membre
        MembreGroupe.objects.filter(groupe=groupe, membre=membre).delete()
        return Response(self.get_serializer(groupe).data)

    @action(detail=True, methods=["post"])
    def inviter(self, request, pk=None):
        groupe = self.get_object()
        # `request.data` est un QueryDict pour un POST multipart/form (pas JSON) : `.get()`
        # n'y renvoie que la DERNIÈRE valeur d'une clé répétée, jamais une liste — même une
        # liste à un seul élément redevient alors une simple chaîne, et itérer dessus
        # itérerait caractère par caractère. `.getlist()` est la lecture correcte dans ce
        # cas (mêmes symptômes que membres_invites, géré nativement par DRF côté
        # PrimaryKeyRelatedField many=True — ici geré à la main car hors serializer).
        if hasattr(request.data, "getlist"):
            membre_ids = request.data.getlist("membres")
        else:
            membre_ids = request.data.get("membres", [])
        for membre_id in membre_ids:
            MembreGroupe.objects.get_or_create(groupe=groupe, membre_id=membre_id)
        return Response(self.get_serializer(groupe).data)


class MessageGroupeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Liste seule — l'envoi d'un message passe exclusivement par `GroupeChatConsumer`.
    `?groupe=<id>` est obligatoire."""

    serializer_class = MessageGroupeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = MessageGroupeCursorPagination

    def get_queryset(self):
        groupe_id = self.request.query_params.get("groupe")
        if not groupe_id:
            raise ValidationError({"groupe": "Ce paramètre est requis."})
        groupe = get_object_or_404(GroupeChat, pk=groupe_id)
        membre = getattr(self.request.user, "membre", None)
        if groupe.type_groupe != "public":
            if membre is None or not groupe.membres_groupe.filter(membre=membre).exists():
                raise PermissionDenied("Vous n'êtes pas membre de ce groupe.")
        return MessageGroupe.objects.filter(groupe=groupe).select_related("auteur")


# ---------------------------------------------------------------------------
# Live Match, Albums, Quiz (troisième lot — Phase 4B) :
#
#   GET/POST     /communaute/matchs/                    — lecture ouverte à tout
#                                                           authentifié, gestion (créer/
#                                                           modifier le score/chrono/statut)
#                                                           réservée à Bureau Admin+ ; toute
#                                                           modification est diffusée au
#                                                           groupe WebSocket live_{id}
#   GET          /communaute/match-commentaires/?match=  — historique ; ENVOYER un
#                                                           commentaire passe UNIQUEMENT par
#                                                           LiveMatchConsumer (WebSocket)
#
#   GET/POST     /communaute/albums/                     — liste/création (upload
#                                                           collaboratif)
#   PATCH/DELETE /communaute/albums/{id}/                 — créateur ou Bureau Admin+
#   GET/POST     /communaute/photos/?album=               — liste (filtrée par album) /
#                                                           upload (image validée + ré-
#                                                           encodée, voir validators.py)
#   PATCH/DELETE /communaute/photos/{id}/                  — propriétaire ou Bureau Admin+
#   POST         /communaute/photos/{id}/liker/            — bascule like
#   POST         /communaute/photos/{id}/masquer/          — modération (Bureau Admin+)
#   POST/DELETE  /communaute/photo-commentaires/           — commenter une photo
#
#   GET/POST     /communaute/quiz/                        — lecture ouverte à tout
#                                                           authentifié (questions imbriquées,
#                                                           est_correct masqué) ; création/
#                                                           modification réservée à Bureau
#                                                           Admin+
#   POST         /communaute/quiz/{id}/demarrer/           — démarre (ou retrouve) MA
#                                                           participation
#   POST         /communaute/quiz/{id}/repondre/           — {"question":.., "choix":..} —
#                                                           correction et points TOUJOURS
#                                                           recalculés côté serveur
#   GET          /communaute/quiz/{id}/classement/         — top 10 + ma participation
#   GET/POST     /communaute/quiz-questions/               — gestion Bureau Admin+ (créer
#                                                           les questions d'un quiz)
#   GET/POST     /communaute/quiz-choix/                   — gestion Bureau Admin+ (créer
#                                                           les choix d'une question, dont
#                                                           `est_correct`)
# ---------------------------------------------------------------------------


class MatchCursorPagination(CursorPagination):
    ordering = ("-date_heure", "id")


class MatchCommentaireCursorPagination(CursorPagination):
    ordering = ("created_at", "id")


class AlbumCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class PhotoCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class QuizCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class MatchViewSet(viewsets.ModelViewSet):
    serializer_class = MatchSerializer
    permission_classes = [MatchPermission]
    pagination_class = MatchCursorPagination
    queryset = Match.objects.prefetch_related("reactions")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        match = serializer.save()
        self._broadcast_match_update(match)

    @staticmethod
    def _broadcast_match_update(match):
        # Diffuse la mise à jour REST (score/chrono/statut, modérateur Bureau Admin+) au
        # groupe WebSocket du match — même mécanisme que
        # apps.vote.views.VoteSessionViewSet._broadcast_resultats (voir docstring de tête
        # models.py).
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"live_{match.id}",
            {
                "type": "match_update",
                "payload": {
                    "id": str(match.id),
                    "statut": match.statut,
                    "score_ca": match.score_ca,
                    "score_adversaire": match.score_adversaire,
                    "minute_chrono": match.minute_chrono,
                },
            },
        )


class MatchCommentaireViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Liste seule — l'envoi passe exclusivement par `LiveMatchConsumer`."""

    serializer_class = MatchCommentaireSerializer
    permission_classes = [MatchCommentairePermission]
    pagination_class = MatchCommentaireCursorPagination

    def get_queryset(self):
        match_id = self.request.query_params.get("match")
        if not match_id:
            raise ValidationError({"match": "Ce paramètre est requis."})
        get_object_or_404(Match, pk=match_id)
        return MatchCommentaire.objects.filter(match_id=match_id).select_related("auteur")


class AlbumViewSet(viewsets.ModelViewSet):
    serializer_class = AlbumSerializer
    permission_classes = [AlbumPermission]
    pagination_class = AlbumCursorPagination
    queryset = Album.objects.select_related("createur", "evenement")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class PhotoViewSet(viewsets.ModelViewSet):
    serializer_class = PhotoSerializer
    permission_classes = [PhotoPermission]
    pagination_class = PhotoCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["album"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Photo.objects.select_related("membre", "album").prefetch_related(
            "likes", "commentaires__auteur"
        )
        user = self.request.user
        if ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL:
            return qs
        return qs.filter(est_masquee=False)

    @action(detail=True, methods=["post"])
    def liker(self, request, pk=None):
        photo = self.get_object()
        membre = request.user.membre
        like, cree = PhotoLike.objects.get_or_create(photo=photo, membre=membre)
        if not cree:
            like.delete()
        # Même piège que PublicationViewSet.liker — le prefetch_related("likes", ...) de
        # get_queryset() porte encore le cache d'AVANT la bascule ci-dessus.
        photo.refresh_from_db()
        return Response(self.get_serializer(photo).data)

    @action(detail=True, methods=["post"])
    def masquer(self, request, pk=None):
        photo = self.get_object()
        photo.est_masquee = not photo.est_masquee
        photo.masquee_par = request.user if photo.est_masquee else None
        photo.save(update_fields=["est_masquee", "masquee_par"])
        log_audit_event(
            "photo_masquee" if photo.est_masquee else "photo_demasquee",
            user=request.user,
            ip_address=_client_ip(request),
            photo_id=str(photo.id),
        )
        return Response(self.get_serializer(photo).data)


class PhotoCommentaireViewSet(
    mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    serializer_class = PhotoCommentaireSerializer
    permission_classes = [PhotoCommentairePermission]
    queryset = PhotoCommentaire.objects.select_related("auteur", "photo")


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer
    permission_classes = [QuizPermission]
    pagination_class = QuizCursorPagination
    queryset = Quiz.objects.prefetch_related("questions__choix")
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def demarrer(self, request, pk=None):
        quiz = self.get_object()
        membre = request.user.membre
        participation, _cree = ParticipationQuiz.objects.get_or_create(quiz=quiz, membre=membre)
        return Response(
            ParticipationQuizSerializer(participation, context=self.get_serializer_context()).data
        )

    @action(detail=True, methods=["post"])
    def repondre(self, request, pk=None):
        quiz = self.get_object()
        membre = request.user.membre
        participation = ParticipationQuiz.objects.filter(quiz=quiz, membre=membre).first()
        if participation is None:
            raise ValidationError(
                "Démarrez le quiz avant de répondre (voir action 'demarrer')."
            )
        if participation.terminee_le is not None:
            raise PermissionDenied("Cette participation est déjà terminée.")

        question = get_object_or_404(QuestionQuiz, pk=request.data.get("question"), quiz=quiz)
        choix = get_object_or_404(ChoixQuestion, pk=request.data.get("choix"), question=question)

        if ReponseQuiz.objects.filter(participation=participation, question=question).exists():
            raise ValidationError({"question": "Cette question a déjà une réponse enregistrée."})

        # Correction et points TOUJOURS calculés côté serveur, jamais transmis par le
        # client (CLAUDE.md §8, voir docstring de tête models.py).
        est_correct = choix.est_correct
        points = question.points if est_correct else 0
        reponse = ReponseQuiz.objects.create(
            participation=participation,
            question=question,
            choix=choix,
            est_correct=est_correct,
            points_obtenus=points,
        )

        update_fields = []
        if est_correct:
            participation.score += points
            update_fields.append("score")
        if participation.reponses.count() >= quiz.questions.count():
            participation.terminee_le = timezone.now()
            update_fields.append("terminee_le")
        if update_fields:
            participation.save(update_fields=update_fields)

        return Response(ReponseQuizSerializer(reponse).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def classement(self, request, pk=None):
        quiz = self.get_object()
        top = quiz.participations.filter(terminee_le__isnull=False).select_related("membre")[:10]
        data = {
            "classement": ParticipationQuizSerializer(
                top, many=True, context=self.get_serializer_context()
            ).data
        }
        membre = getattr(request.user, "membre", None)
        if membre is not None:
            ma_participation = quiz.participations.filter(membre=membre).first()
            if ma_participation is not None:
                data["ma_participation"] = ParticipationQuizSerializer(
                    ma_participation, context=self.get_serializer_context()
                ).data
        return Response(data)


class QuestionQuizViewSet(viewsets.ModelViewSet):
    """Gestion Bureau Admin+ des questions — jamais consultée directement par un membre
    standard (voir GestionQuizPermission)."""

    serializer_class = QuestionQuizSerializer
    permission_classes = [GestionQuizPermission]
    queryset = QuestionQuiz.objects.select_related("quiz").prefetch_related("choix")
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["quiz"]


class ChoixQuestionViewSet(viewsets.ModelViewSet):
    """Gestion Bureau Admin+ des choix (dont `est_correct`) — voir GestionQuizPermission."""

    serializer_class = ChoixQuestionSerializer
    permission_classes = [GestionQuizPermission]
    queryset = ChoixQuestion.objects.select_related("question")
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["question"]

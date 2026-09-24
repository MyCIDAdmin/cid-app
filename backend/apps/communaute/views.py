"""
Vues API — app communaute, lot Fil d'actualité + Forum (Release Plan §3.2) :

  GET/POST   /communaute/publications/                 — fil d'actualité (lecture : tout
                                                           authentifié, publications non
                                                           masquées uniquement en dessous de
                                                           Bureau Admin — voir get_queryset)
  PATCH/DELETE /communaute/publications/{id}/           — propriétaire ou Bureau Admin+
                                                           (demande utilisateur du
                                                           2026-09-16 : un post géré/
                                                           supprimé par l'Admin passait déjà
                                                           par ce même DELETE côté backend —
                                                           seul le bouton manquait côté
                                                           frontend, voir FilPage.tsx)
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

from django.db.models import Q, Sum
from django.db.models.functions import Coalesce
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
from apps.membres.models import Membre, StatutMembre

from .filters import PublicationFilter, SujetFilter
from .models import (
    Album,
    ChoixQuestion,
    ClassementLigue,
    Commentaire,
    Conversation,
    GroupeChat,
    Match,
    MatchCommentaire,
    MatchEvenement,
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
    QuestionQuiz,
    Quiz,
    RencontreCalendrier,
    ReponseForum,
    ReponseQuiz,
    StatistiqueJoueur,
    StatutPaiementTeilnahme,
    StatutTippspiel,
    Sujet,
    Tippspiel,
    TippspielTeilnahme,
    TippspielTip,
)
from .notifications import notifier_nouveau_commentaire_fil, notifier_nouvelle_reponse_forum
from .permissions import (
    DIR_FINANCIER_MIN_LEVEL,
    MODERATION_MIN_LEVEL,
    SUPER_ADMIN_MIN_LEVEL,
    AlbumPermission,
    ContenuCommunautePermission,
    ConversationPermission,
    GestionQuizPermission,
    GroupeChatPermission,
    MatchCommentairePermission,
    MatchEvenementPermission,
    MatchPermission,
    MessageGroupePermission,
    MessagePrivePermission,
    PhotoCommentairePermission,
    PhotoPermission,
    QuizPermission,
    TippspielPermission,
    TippspielTeilnahmePermission,
    TippspielTipPermission,
)
from .serializers import (
    AlbumSerializer,
    AuteurSerializer,
    ChoixQuestionSerializer,
    ClassementLigueSerializer,
    CommentaireSerializer,
    ConversationSerializer,
    GroupeChatSerializer,
    MatchCommentaireSerializer,
    MatchEvenementSerializer,
    MatchSerializer,
    MessageGroupeSerializer,
    MessagePriveSerializer,
    ParticipationQuizSerializer,
    PhotoCommentaireSerializer,
    PhotoSerializer,
    PublicationSerializer,
    QuestionQuizSerializer,
    QuizSerializer,
    RencontreCalendrierSerializer,
    ReponseForumSerializer,
    ReponseQuizSerializer,
    StatistiqueJoueurSerializer,
    SujetSerializer,
    TippspielSerializer,
    TippspielTeilnahmeSerializer,
    TippspielTipSerializer,
    nom_affiche_utilisateur,
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

    def perform_create(self, serializer):
        serializer.save()
        # Notification (ajoutée le 2026-09-16) — auteur de la publication + auteur du
        # commentaire parent si réponse, voir notifications.notifier_nouveau_commentaire_fil.
        notifier_nouveau_commentaire_fil(serializer.instance)

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
        # Notification (ajoutée le 2026-09-16) — auteur du sujet + précédents répondants
        # uniquement, voir notifications.notifier_nouvelle_reponse_forum.
        notifier_nouvelle_reponse_forum(serializer.instance)

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
#   DELETE     /communaute/messages-prives/{id}/           — expéditeur uniquement (demande
#                                                             utilisateur du 2026-09-16),
#                                                             diffusée en temps réel au
#                                                             WebSocket de la conversation
#                                                             (voir _broadcast_message_supprime)
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
#   DELETE     /communaute/messages-groupe/{id}/           — auteur uniquement (demande
#                                                             utilisateur du 2026-09-16),
#                                                             diffusée en temps réel au
#                                                             WebSocket du groupe
# ---------------------------------------------------------------------------


def _broadcast_message_supprime(group_name: str, message_id: str) -> None:
    """Diffuse la suppression d'un message (privé ou de groupe) au groupe WebSocket
    concerné — même mécanisme REST -> WS que `MatchViewSet._broadcast_match_update` (voir
    consumers.py : `MessagerieConsumer.message_supprime` / `GroupeChatConsumer
    .message_supprime`), pour que les fenêtres de discussion déjà ouvertes des autres
    participants retirent le message immédiatement plutôt qu'au prochain rechargement."""
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        group_name,
        {"type": "message_supprime", "payload": {"id": message_id}},
    )


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


class MessagePriveViewSet(mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Liste seule + suppression — l'ENVOI d'un message passe exclusivement par
    `MessagerieConsumer` (voir docstring de tête de consumers.py). `?conversation=<id>` est
    obligatoire pour lister. `DELETE /{id}/` (demande utilisateur du 2026-09-16, "Nachricht
    ... kann vom Ersteller gelöscht werden") : suppression définitive réservée à
    l'expéditeur (voir MessagePrivePermission), diffusée en temps réel au WebSocket de la
    conversation pour que la fenêtre de l'autre participant retire aussi le message."""

    serializer_class = MessagePriveSerializer
    permission_classes = [MessagePrivePermission]
    pagination_class = MessagePriveCursorPagination

    def get_queryset(self):
        if self.action == "destroy":
            # Pas de filtre par conversation ici (contrairement au `list` ci-dessous) — la
            # permission objet (MessagePrivePermission, expéditeur uniquement) est le seul
            # contrôle nécessaire, même principe que ContenuCommunautePermission pour
            # Publication/Commentaire (queryset large, IDOR géré par has_object_permission).
            return MessagePrive.objects.select_related("expediteur", "conversation")
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

    def perform_destroy(self, instance):
        conversation_id = str(instance.conversation_id)
        message_id = str(instance.id)
        super().perform_destroy(instance)
        _broadcast_message_supprime(f"messagerie_{conversation_id}", message_id)


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


class MessageGroupeViewSet(
    mixins.ListModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    """Liste seule + suppression — l'ENVOI d'un message passe exclusivement par
    `GroupeChatConsumer`. `?groupe=<id>` est obligatoire pour lister. `DELETE /{id}/`
    (demande utilisateur du 2026-09-16, même principe que MessagePriveViewSet) :
    suppression définitive réservée à l'auteur (voir MessageGroupePermission), diffusée en
    temps réel au WebSocket du groupe."""

    serializer_class = MessageGroupeSerializer
    permission_classes = [MessageGroupePermission]
    pagination_class = MessageGroupeCursorPagination

    def get_queryset(self):
        if self.action == "destroy":
            # Même raisonnement que MessagePriveViewSet.get_queryset : queryset large, IDOR
            # géré par la permission objet (auteur uniquement).
            return MessageGroupe.objects.select_related("auteur", "groupe")
        groupe_id = self.request.query_params.get("groupe")
        if not groupe_id:
            raise ValidationError({"groupe": "Ce paramètre est requis."})
        groupe = get_object_or_404(GroupeChat, pk=groupe_id)
        membre = getattr(self.request.user, "membre", None)
        if groupe.type_groupe != "public":
            if membre is None or not groupe.membres_groupe.filter(membre=membre).exists():
                raise PermissionDenied("Vous n'êtes pas membre de ce groupe.")
        return MessageGroupe.objects.filter(groupe=groupe).select_related("auteur")

    def perform_destroy(self, instance):
        groupe_id = str(instance.groupe_id)
        message_id = str(instance.id)
        super().perform_destroy(instance)
        _broadcast_message_supprime(f"groupe_{groupe_id}", message_id)


class MembreRechercheCursorPagination(CursorPagination):
    # "id" en dernier pour garantir un tri strictement déterministe, requis par CursorPagination
    # (même correctif que SujetCursorPagination/VarianteCursorPagination ci-dessus) — sans lui,
    # get_queryset() ci-dessous levait "Cannot reorder a query once a slice has been taken"
    # (la pagination par défaut du projet réordonne toujours la queryset selon `ordering`).
    ordering = ("nom", "prenom", "id")


class MembreRechercheViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Annuaire minimal des membres pour démarrer une conversation (MessageriePage) ou inviter
    dans un groupe privé (GroupesPage) — `?q=<recherche>` optionnel : sans lui (ou vide),
    renvoie une liste parcourable (ordre alphabétique, 20 premiers) plutôt qu'une liste vide,
    pour permettre de choisir un destinataire sans connaître son nom exact (bug remonté en test
    manuel Phase 4 : "muss es möglich sein einer Liste an Mitgliedern auszuwählen") ; avec lui,
    filtre par nom/prénom.

    Distincte de `apps.membres.MembreViewSet` : ce dernier restreint volontairement la liste
    des membres à RH+ (protection IDOR, voir sa docstring `get_queryset`, "un membre ne voit
    jamais la liste des autres") pour ne pas exposer la fiche complète (adresse, CIN, email...).
    Ici on expose sciemment un annuaire minimal — seulement nom/prénom/photo via
    `AuteurSerializer`, exactement ce que tout membre voit déjà à côté de chaque publication/
    commentaire/message dans le reste du module communaute — à tout authentifié, sans quoi
    Messagerie et Groupes sont inutilisables pour un rôle Membre standard (bug remonté en
    test manuel Phase 4)."""

    serializer_class = AuteurSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = MembreRechercheCursorPagination

    def get_queryset(self):
        q = self.request.query_params.get("q", "").strip()
        queryset = Membre.objects.filter(statut=StatutMembre.ACTIF)
        if q:
            queryset = queryset.filter(Q(nom__icontains=q) | Q(prenom__icontains=q))
        membre = getattr(self.request.user, "membre", None)
        if membre is not None:
            queryset = queryset.exclude(id=membre.id)
        # Pas de slice manuel ici : MembreRechercheCursorPagination applique déjà le PAGE_SIZE
        # global (20, voir config/settings/base.py) et a besoin de la queryset non tronquée pour
        # pouvoir la réordonner selon `ordering`.
        return queryset.order_by("nom", "prenom")


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


# ---------------------------------------------------------------------------
# Fan-Club — extension du Live Match (2026-09-24) :
#
#   GET          /communaute/classement/            — tableau de classement (lecture seule,
#                                                       synchronisé périodiquement, voir
#                                                       apps.communaute.services)
#   GET          /communaute/calendrier/             — calendrier des rencontres (idem)
#   GET          /communaute/statistiques-joueurs/    — statistiques individuelles (buts/
#                                                        passes/cartons, idem)
#   GET          /communaute/match-evenements/?match= — journal d'événements du Live-Ticker
#   POST         /communaute/match-evenements/        — ajouter un événement (Bureau Admin+),
#                                                        diffusé en direct au groupe WebSocket
#                                                        live_{match_id}
# ---------------------------------------------------------------------------


class ClassementCursorPagination(CursorPagination):
    ordering = ("saison", "rang", "id")


class CalendrierCursorPagination(CursorPagination):
    # Ordre décroissant (2026-09-24, bascule GOAL API) : le calendrier synchronisé couvre
    # désormais tout l'historique disponible (198 rencontres, 2021 → saison en cours+à
    # venir, voir services.py) — avec l'ancien ordre croissant, la première page (PAGE_SIZE
    # dans settings/base.py) ne montrait QUE les rencontres les plus anciennes, jamais les
    # rencontres à venir ni les résultats récents. Décroissant place systématiquement les
    # rencontres à venir (date future) en tête, suivies des résultats les plus récents —
    # même convention que MatchCursorPagination (onglet Ticker) ci-dessus.
    ordering = ("-date_heure", "id")


class MatchEvenementCursorPagination(CursorPagination):
    ordering = ("minute", "created_at", "id")


class ClassementLigueViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Lecture seule — jamais éditable manuellement, voir docstring de tête models.py."""

    serializer_class = ClassementLigueSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = ClassementCursorPagination
    queryset = ClassementLigue.objects.all()


class RencontreCalendrierViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Lecture seule — jamais éditable manuellement, voir docstring de tête models.py."""

    serializer_class = RencontreCalendrierSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = CalendrierCursorPagination
    queryset = RencontreCalendrier.objects.all()


class StatistiqueJoueurCursorPagination(CursorPagination):
    ordering = ("-buts", "nom", "id")


class StatistiqueJoueurViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Lecture seule — jamais éditable manuellement, voir docstring de tête models.py.
    Alimente les listes Torschützen/Kartenstatistik de l'onglet Statistiken (tri par buts
    décroissants par défaut ; le frontend re-trie côté client pour la vue Kartenstatistik,
    voir StatistiquesTab.tsx)."""

    serializer_class = StatistiqueJoueurSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StatistiqueJoueurCursorPagination
    queryset = StatistiqueJoueur.objects.all()


class MatchEvenementViewSet(
    mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """Journal d'événements du Live-Ticker (buts/cartons/etc., module Fan-Club) — liste
    filtrée par `?match=`, création réservée à Bureau Admin+ (voir
    MatchEvenementPermission), diffusée en direct au groupe WebSocket `live_{match_id}`
    (même mécanisme REST -> WS que `MatchViewSet._broadcast_match_update` ci-dessus)."""

    serializer_class = MatchEvenementSerializer
    permission_classes = [MatchEvenementPermission]
    pagination_class = MatchEvenementCursorPagination

    def get_queryset(self):
        match_id = self.request.query_params.get("match")
        if not match_id:
            raise ValidationError({"match": "Ce paramètre est requis."})
        get_object_or_404(Match, pk=match_id)
        return MatchEvenement.objects.filter(match_id=match_id).select_related("created_by__membre")

    def perform_create(self, serializer):
        evenement = serializer.save(created_by=self.request.user)
        self._broadcast_match_evenement(evenement)

    @staticmethod
    def _broadcast_match_evenement(evenement):
        # Payload construit à la main (id/match en str, created_at en isoformat) plutôt que
        # `MatchEvenementSerializer(evenement).data` brut : le groupe WebSocket sérialise en
        # JSON (voir LiveMatchConsumer.match_evenement/send_json), qui ne sait pas encoder un
        # UUID/datetime — même convention que `receive_json` (voir consumers.py, payload du
        # commentaire construit à la main pour la même raison).
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        if channel_layer is None:
            return
        async_to_sync(channel_layer.group_send)(
            f"live_{evenement.match_id}",
            {
                "type": "match_evenement",
                "payload": {
                    "id": str(evenement.id),
                    "match": str(evenement.match_id),
                    "type_evenement": evenement.type_evenement,
                    "minute": evenement.minute,
                    "equipe": evenement.equipe,
                    "joueur": evenement.joueur,
                    "description": evenement.description,
                    "created_by_nom": nom_affiche_utilisateur(evenement.created_by),
                    "created_at": evenement.created_at.isoformat(),
                },
            },
        )


# ---------------------------------------------------------------------------
# Tippspiel (pronostics Ligue 1) — voir docstring de tête models.py, section Tippspiel.
# ---------------------------------------------------------------------------


class TippspielCursorPagination(CursorPagination):
    ordering = ("-created_at", "id")


class TippspielTeilnahmeCursorPagination(CursorPagination):
    ordering = ("-total_points", "id")


class TippspielTipCursorPagination(CursorPagination):
    ordering = ("rencontre__date_heure", "id")


class TippspielViewSet(viewsets.ModelViewSet):
    """Le jeu de pronostics lui-même — CRUD réservé à l'Administrateur App (voir
    TippspielPermission). Lecture ouverte à tout authentifié mais FILTRÉE : un membre
    standard ne voit jamais un Tippspiel encore `brouillon` ("Anzeigbar nachdem es
    eingestellt und veröffentlicht wird", retour utilisateur) — seul l'Administrateur
    App (qui a créé/édite le brouillon) voit tout. `teilnehmen` : rejoindre le jeu, tout
    authentifié (voir TippspielPermission.has_permission, "teilnehmen" n'est pas une
    action d'écriture du jeu lui-même donc déjà ouverte à tous)."""

    serializer_class = TippspielSerializer
    permission_classes = [TippspielPermission]
    pagination_class = TippspielCursorPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = Tippspiel.objects.prefetch_related("prix").select_related("created_by")
        user = self.request.user
        if ROLE_LEVELS.get(user.role, 0) >= SUPER_ADMIN_MIN_LEVEL:
            return qs
        return qs.exclude(statut=StatutTippspiel.BROUILLON)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=["post"])
    def teilnehmen(self, request, pk=None):
        tippspiel = self.get_object()
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError("Aucune fiche membre associée à ce compte.")
        if tippspiel.statut != StatutTippspiel.PUBLIE:
            raise ValidationError("Ce Tippspiel n'est pas (ou plus) ouvert aux inscriptions.")
        teilnahme, _cree = TippspielTeilnahme.objects.rejoindre(tippspiel, membre)
        return Response(
            TippspielTeilnahmeSerializer(teilnahme, context=self.get_serializer_context()).data
        )


class TippspielTeilnahmeViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Classement (participations CONFIRMÉES d'un Tippspiel, annotées de leur total de
    points) — filtré par `?tippspiel=<id>` (requis). `?mine=true` bascule sur la
    participation du membre courant quel que soit son statut de paiement, pour afficher
    "en attente de confirmation" côté frontend ("Eine Tabelle zeigt alle Teilnehmer",
    retour utilisateur — mais seules les inscriptions confirmées y figurent, voir
    docstring de tête TippspielTeilnahme dans models.py). `?statut_paiement=en_attente` :
    liste (toutes membres confondus) des paiements à confirmer — réservée Directeur
    Financier+ (contrôle explicite dans `get_queryset`, IDOR sinon puisque
    `TippspielTeilnahmePermission.has_permission` ne gate que `confirmer_paiement` ;
    CLAUDE.md §8), alimente l'écran de confirmation ("bestätigt vom Finanzdirektor",
    retour utilisateur — jusqu'ici aucun endpoint ne permettait de RETROUVER les
    paiements en attente, seulement de confirmer un id déjà connu). `confirmer-paiement` :
    Directeur Financier+ uniquement, voir TippspielTeilnahmePermission."""

    serializer_class = TippspielTeilnahmeSerializer
    permission_classes = [TippspielTeilnahmePermission]
    pagination_class = TippspielTeilnahmeCursorPagination
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        # `total_points` toujours annoté : le serializer le lit comme un champ ordinaire
        # (IntegerField), pas un SerializerMethodField — le laisser absent ferait échouer
        # la sérialisation, y compris pour un accès détail (ex. `confirmer-paiement`).
        qs = TippspielTeilnahme.objects.select_related("membre").annotate(
            total_points=Coalesce(Sum("tipps__points"), 0)
        )
        # Le filtre `?tippspiel=` (requis) ne s'applique qu'au `list` : une action détail
        # (ex. `confirmer-paiement`) identifie déjà la participation exacte via `pk`, et
        # exiger `?tippspiel=` en plus casserait ces actions pour tout appelant qui ne
        # passe pas ce paramètre redondant (cf. NoReverseMatch/400 rencontré en test).
        if self.action != "list":
            return qs
        tippspiel_id = self.request.query_params.get("tippspiel")
        if not tippspiel_id:
            raise ValidationError({"tippspiel": "Ce paramètre est requis."})
        qs = qs.filter(tippspiel_id=tippspiel_id)
        if self.request.query_params.get("mine") == "true":
            membre = getattr(self.request.user, "membre", None)
            return qs.filter(membre=membre) if membre is not None else qs.none()
        if self.request.query_params.get("statut_paiement") == "en_attente":
            user = self.request.user
            if ROLE_LEVELS.get(user.role, 0) < DIR_FINANCIER_MIN_LEVEL:
                raise PermissionDenied(
                    "Réservé au Directeur Financier pour la confirmation des paiements."
                )
            return qs.filter(statut_paiement=StatutPaiementTeilnahme.EN_ATTENTE).order_by(
                "created_at"
            )
        return qs.filter(
            statut_paiement__in=[
                StatutPaiementTeilnahme.SANS_FRAIS,
                StatutPaiementTeilnahme.CONFIRMEE,
            ]
        ).order_by("-total_points", "created_at")

    @action(detail=True, methods=["post"], url_path="confirmer-paiement")
    def confirmer_paiement(self, request, pk=None):
        teilnahme = self.get_object()
        if teilnahme.statut_paiement == StatutPaiementTeilnahme.SANS_FRAIS:
            raise ValidationError(
                "Ce Tippspiel est gratuit — aucune confirmation de paiement n'est nécessaire."
            )
        if teilnahme.statut_paiement == StatutPaiementTeilnahme.CONFIRMEE:
            raise ValidationError("Ce paiement est déjà confirmé.")
        teilnahme.statut_paiement = StatutPaiementTeilnahme.CONFIRMEE
        teilnahme.confirmee_par = request.user
        teilnahme.confirmee_le = timezone.now()
        teilnahme.save(update_fields=["statut_paiement", "confirmee_par", "confirmee_le"])
        return Response(
            TippspielTeilnahmeSerializer(teilnahme, context=self.get_serializer_context()).data
        )


class TippspielTipViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Un membre gère STRICTEMENT ses propres pronostics — `get_queryset` filtre
    toujours sur `teilnahme__membre=request.user.membre` ; aucun `?membre=` ou
    équivalent exposé au client (IDOR, voir TippspielTipPermission pour le contrôle
    objet en deuxième ligne de défense, CLAUDE.md §8). Filtrable par `?tippspiel=<id>`.
    Points/date-limite/périmètre Ligue 1 toujours recalculés/validés côté serveur (voir
    TippspielTipSerializer, services.py::recalculer_points_tippspiel) — jamais fait
    confiance au frontend."""

    serializer_class = TippspielTipSerializer
    permission_classes = [TippspielTipPermission]
    pagination_class = TippspielTipCursorPagination
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            return TippspielTip.objects.none()
        qs = TippspielTip.objects.filter(teilnahme__membre=membre).select_related("rencontre")
        tippspiel_id = self.request.query_params.get("tippspiel")
        if tippspiel_id:
            qs = qs.filter(teilnahme__tippspiel_id=tippspiel_id)
        return qs


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
            raise ValidationError("Démarrez le quiz avant de répondre (voir action 'demarrer').")
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

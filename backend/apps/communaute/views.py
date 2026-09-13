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

from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response

from apps.accounts.models import ROLE_LEVELS
from apps.accounts.services import log_audit_event

from .filters import PublicationFilter, SujetFilter
from .models import (
    Commentaire,
    Publication,
    PublicationLike,
    PublicationPartage,
    ReponseForum,
    Sujet,
)
from .permissions import MODERATION_MIN_LEVEL, ContenuCommunautePermission
from .serializers import (
    CommentaireSerializer,
    PublicationSerializer,
    ReponseForumSerializer,
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

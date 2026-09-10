"""
Vues API — app membres (TDD §2.4) :
  GET            /membres/                      — liste (scope selon rôle)
  POST           /membres/                      — créer (RH+)
  GET            /membres/{id}/                 — détail (scope selon rôle)
  PATCH/PUT      /membres/{id}/                 — modifier (RH+)
  DELETE         /membres/{id}/                 — supprimer (Bureau Admin+)
  POST           /membres/{id}/changer_statut/  — changer le statut (RH+)
"""

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS, Role

from .filters import MembreFilter
from .models import Membre, StatutMembre
from .permissions import MembrePermission
from .serializers import MembreListSerializer, MembreSerializer


class MembreCursorPagination(CursorPagination):
    """Pagination cursor-based (TDD §2.3) — l'ordre doit correspondre à
    Membre.Meta.ordering (nom, prenom) ; id (UUID) sert de départage stable
    pour deux membres homonymes."""

    page_size = 20
    ordering = ("nom", "prenom", "id")


class MembreViewSet(ModelViewSet):
    permission_classes = [MembrePermission]
    pagination_class = MembreCursorPagination
    filter_backends = [DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_class = MembreFilter
    search_fields = ["nom", "prenom", "numero_membre", "email"]

    def get_queryset(self):
        queryset = Membre.objects.select_related("user").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        # Protection IDOR (SCD §2.3, A01) : sous le niveau RH, un membre ne
        # voit jamais la liste des autres — uniquement sa propre fiche, si
        # elle existe et est liée à son compte.
        if ROLE_LEVELS.get(user.role, 0) < ROLE_LEVELS[Role.RH]:
            return queryset.filter(user=user)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return MembreListSerializer
        return MembreSerializer

    @action(detail=True, methods=["post"], url_path="changer_statut")
    def changer_statut(self, request, pk=None):
        membre = self.get_object()
        nouveau_statut = request.data.get("statut")
        if nouveau_statut not in StatutMembre.values:
            return Response(
                {
                    "code": "statut_invalide",
                    "message": "Statut invalide.",
                    "details": {"choix_possibles": list(StatutMembre.values)},
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        membre.statut = nouveau_statut
        membre.save(update_fields=["statut", "updated_at"])
        return Response(MembreSerializer(membre, context=self.get_serializer_context()).data)

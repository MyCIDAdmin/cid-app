"""
Vues API — app membres (TDD §2.4, complété AHM-51) :
  GET            /membres/                      — liste (scope selon rôle)
  POST           /membres/                      — créer (RH+)
  GET            /membres/{id}/                 — détail (scope selon rôle)
  PATCH/PUT      /membres/{id}/                 — modifier (RH+ : toute
                                                    fiche ; Membre : sa propre
                                                    fiche, champs personnels
                                                    uniquement — voir
                                                    MembrePermission /
                                                    MembreSerializer)
  DELETE         /membres/{id}/                 — supprimer (Bureau Admin+)
  POST           /membres/{id}/changer_statut/  — changer le statut (RH+)
  GET/PATCH      /membres/moi/                  — fiche du compte connecté (bouton "Mon profil",
                                                    ajouté le 2026-09-28), sans connaître son id
"""

from django.db.models import Prefetch
from django.db.models.deletion import ProtectedError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters as drf_filters
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.exceptions import Conflict
from apps.rbac.permissions import module_access_permission
from apps.rbac.services import is_elevated_for_module

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


class MembreOrderingFilter(drf_filters.OrderingFilter):
    """Tri du Verzeichnis (paramètre `ordering`, liste blanche — un champ inconnu est ignoré).

    Sert aussi à MembreCursorPagination : DRF y utilise le premier backend de filtre qui expose
    `get_ordering`. On complète toujours l'ordre par (nom, prenom, id) pour qu'il soit total —
    indispensable pour que la pagination par curseur reste stable (homonymes, valeurs égales)."""

    ordering_fields = ["nom", "prenom", "numero_membre", "statut", "ville_de", "date_adhesion"]
    ordering_param = "ordering"
    DEPARTAGE = ("nom", "prenom", "id")

    def get_ordering(self, request, queryset, view):
        champs = list(super().get_ordering(request, queryset, view) or [])
        deja = {champ.lstrip("-") for champ in champs}
        champs.extend(champ for champ in self.DEPARTAGE if champ not in deja)
        return champs


class MembreViewSet(ModelViewSet):
    # apps.rbac Phase B (ajouté le 2026-09-23) : module_access_permission("membres") est une
    # porte SUPPLÉMENTAIRE (DRF combine permission_classes en ET logique) — elle ouvre l'accès
    # à un rôle personnalisé selon la matrice Rôle×Module, jamais à la place de MembrePermission
    # qui reste la source de vérité pour les 5 rôles système et pour le scope objet par objet.
    permission_classes = [MembrePermission, module_access_permission("membres")]
    pagination_class = MembreCursorPagination
    filter_backends = [MembreOrderingFilter, DjangoFilterBackend, drf_filters.SearchFilter]
    filterset_class = MembreFilter
    search_fields = ["nom", "prenom", "numero_membre", "email"]

    def get_queryset(self):
        from apps.adhesions.models import Souscription

        queryset = Membre.objects.select_related("user").prefetch_related(
            Prefetch(
                "souscriptions",
                queryset=Souscription.objects.select_related("offre", "campagne").order_by(
                    "-campagne__annee", "-campagne__date_debut"
                ),
                to_attr="souscriptions_recentes",
            )
        )
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        # Protection IDOR (SCD §2.3, A01) : sous le niveau RH, un membre ne
        # voit jamais la liste des autres — uniquement sa propre fiche, si
        # elle existe et est liée à son compte.
        # apps.rbac Phase B : sauf si un rôle personnalisé lui donne un accès élevé sur ce
        # module (voir is_elevated_for_module) — même logique que MembrePermission ci-dessus.
        if ROLE_LEVELS.get(user.role, 0) < ROLE_LEVELS[Role.RH] and not is_elevated_for_module(
            user, "membres"
        ):
            return queryset.filter(user=user)
        return queryset

    def get_serializer_class(self):
        if self.action == "list":
            return MembreListSerializer
        return MembreSerializer

    def perform_destroy(self, instance):
        """ProtectedError (ex. Souscription liée, on_delete=PROTECT) -> 409, comme
        apps.rbac.views.RoleViewSet.perform_destroy pour le cas analogue."""
        try:
            instance.delete()
        except ProtectedError as exc:
            raise Conflict(
                "Ce membre a encore des données liées (souscriptions, cotisations, "
                "commandes...) — impossible de le supprimer directement."
            ) from exc

    @action(detail=False, methods=["get", "patch"], url_path="moi")
    def moi(self, request):
        """Fiche Membre du compte connecté (bouton "Mein Profil" du menu utilisateur, ajouté le
        2026-09-28) — évite au frontend de devoir d'abord connaître l'id de sa propre fiche pour
        y accéder. `detail=False` place cette action AVANT la route générique `{pk}/` dans
        l'ordre d'inclusion du DefaultRouter (SimpleRouter.routes : list, extra list actions,
        PUIS detail), donc pas de collision malgré le regex de pk non restreint à un UUID (voir
        urls.py). Réutilise `MembreSerializer` tel quel : le verrouillage des champs
        administratifs (__init__) et le masquage CIN/passeport (to_representation) s'appliquent
        déjà automatiquement via `self.get_serializer_context()` (contient `request`) — mais ici
        `membre.user_id == user.id` est toujours vrai par construction, donc le CIN/passeport
        démasqué et les seules restrictions liées au rôle du compte s'appliquent normalement.
        404 (pas 403/{}) si aucune fiche Membre n'est liée à ce compte (superuser, RH créé hors
        auto-inscription — voir authStore.CidUser.statut_membre côté frontend) : signale
        clairement au frontend qu'il n'y a rien à éditer ici plutôt qu'une erreur ambiguë."""
        membre = Membre.objects.select_related("user").filter(user=request.user).first()
        if membre is None:
            return Response(
                {
                    "code": "aucune_fiche_membre",
                    "message": "Aucune fiche membre n'est liée à ce compte.",
                    "details": {},
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        if request.method == "GET":
            serializer = MembreSerializer(membre, context=self.get_serializer_context())
            return Response(serializer.data)
        serializer = MembreSerializer(
            membre, data=request.data, partial=True, context=self.get_serializer_context()
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

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

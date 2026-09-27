"""
Vues API — app projets (module "Projets & Actions", demande utilisateur du 2026-09-22 —
voir docstring de module de models.py pour le détail des 8 points) :

  GET/POST         /projets/projets/                — kacheln (lecture : tout authentifié,
                                                        statut "en_preparation" masqué sous
                                                        Bureau Admin ; écriture : Bureau
                                                        Admin+)
  GET/PATCH/DELETE  /projets/projets/{id}/
  GET               /projets/projets/{id}/contributeurs/  — face arrière de la kachel
                                                              (demande utilisateur point 5),
                                                              tout authentifié
  GET/POST          /projets/images/                — carrousel (demande utilisateur
                                                        point 1.1) ; écriture : Bureau
                                                        Admin+ OU responsable du projet
                                                        référencé
  PATCH/DELETE      /projets/images/{id}/
  GET/POST          /projets/mises-a-jour/           — rapport d'avancement (demande
                                                        utilisateur point 7), même règle
                                                        d'écriture que les images
  PATCH/DELETE      /projets/mises-a-jour/{id}/
  GET/POST          /projets/mises-a-jour-images/     — images jointes au rapport, même
                                                        règle d'écriture
  DELETE            /projets/mises-a-jour-images/{id}/

La contribution libre elle-même (demande utilisateur point 2 "freie Beiträge... zu
zahlen") ne passe PAS par ce module : c'est une Cotisation(type_article=projet,
projet=<ce Projet>) créée via POST /cotisations/cotisations/ (voir
apps.cotisations.views.CotisationViewSet — déjà entièrement générique vis-à-vis de
type_article, aucune vue dédiée n'est nécessaire ici, y compris pour le paiement en ligne
Stripe/PayPal ou la saisie pour autrui F-015).
"""

from decimal import Decimal

from django.db.models import Count, Max, Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS
from apps.cotisations.models import Cotisation, StatutCotisation
from apps.membres.models import Membre

from .models import Projet, ProjetImage, ProjetMiseAJour, ProjetMiseAJourImage, StatutProjet
from .permissions import (
    GESTION_PROJETS_MIN_LEVEL,
    GestionContenuProjetPermission,
    ProjetPermission,
    est_gestionnaire_projet,
)
from .serializers import (
    ContributeurSerializer,
    ProjetImageSerializer,
    ProjetMiseAJourImageSerializer,
    ProjetMiseAJourSerializer,
    ProjetSerializer,
)


class ProjetsCursorPagination(CursorPagination):
    """Pour Projet/ProjetImage/ProjetMiseAJourImage — tous ont un champ `ordre` propre
    (voir models.py). PAS pour ProjetMiseAJour, qui n'a pas ce champ — voir
    MisesAJourCursorPagination ci-dessous."""

    page_size = 20
    ordering = ("ordre", "-created_at", "id")


class MisesAJourCursorPagination(CursorPagination):
    """ProjetMiseAJour n'a pas de champ `ordre` (le rapport d'avancement s'ordonne
    naturellement par date, voir Meta.ordering du modèle) — une pagination dédiée plutôt
    que de réutiliser ProjetsCursorPagination, qui lèverait une FieldError sur ce
    modèle."""

    page_size = 20
    ordering = ("-created_at", "id")


class ProjetViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [ProjetPermission]
    serializer_class = ProjetSerializer
    pagination_class = ProjetsCursorPagination

    def get_queryset(self):
        queryset = Projet.objects.select_related("responsable", "created_by").prefetch_related(
            "images"
        )
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_PROJETS_MIN_LEVEL
        ):
            return queryset
        # Un projet "en_preparation" reste masqué à tout rôle < Bureau Admin — même
        # principe que Produit.statut="brouillon"/OffreAdhesionViewSet (voir
        # apps.projets.models.StatutProjet).
        return queryset.exclude(statut=StatutProjet.EN_PREPARATION)

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        serializer.save(created_by=membre)

    @action(detail=True, methods=["get"])
    def contributeurs(self, request, pk=None):
        """Face arrière de la kachel (demande utilisateur point 5, "Details zu den
        Mitgliedern die beigetragen haben") — agrégée à la volée sur le registre
        Cotisation, jamais dénormalisée (voir docstring de module
        serializers.ContributeurSerializer et models.Projet.montant_collecte)."""
        projet = self.get_object()
        totaux = (
            Cotisation.objects.filter(projet=projet, statut=StatutCotisation.PAYEE)
            .values("membre_id")
            .annotate(montant_total=Sum("montant"), derniere_contribution=Max("date_paiement"))
        )
        par_membre = {row["membre_id"]: row for row in totaux if row["membre_id"] is not None}
        membres = Membre.objects.filter(id__in=par_membre.keys())
        lignes = sorted(
            (
                {
                    "membre": membre,
                    "montant_total": par_membre[membre.id]["montant_total"],
                    "derniere_contribution": par_membre[membre.id]["derniere_contribution"],
                }
                for membre in membres
            ),
            key=lambda ligne: ligne["montant_total"],
            reverse=True,
        )
        return Response(ContributeurSerializer(lignes, many=True).data)

    @action(detail=False, methods=["get"])
    def kennzahlen(self, request):
        """Kennzahlen "Donators / Gesammelt / Projekte" de la page d'accueil publique façon
        mycid.org (demande utilisateur 2026-09-26, section C.3 du plan) — agrégées à la volée
        sur le même registre Cotisation que `contributeurs`/`Projet.montant_collecte`, jamais
        dénormalisées. `self.get_queryset()` applique déjà le bon périmètre selon qui demande
        (masque "en_preparation" à un anonyme/membre normal, montre tout à un Bureau Admin+),
        donc ces trois chiffres restent cohérents avec ce que l'appelant peut effectivement
        voir dans la liste des projets. Lecture ouverte à tout le monde (voir ProjetPermission),
        aucune action GET dédiée à protéger davantage — ce ne sont que des totaux, jamais le
        détail nominatif d'un contributeur (contrairement à `contributeurs` ci-dessus)."""
        projets = self.get_queryset()
        totaux = Cotisation.objects.filter(
            projet__in=projets, statut=StatutCotisation.PAYEE
        ).aggregate(montant_collecte=Sum("montant"), nb_donateurs=Count("membre_id", distinct=True))
        return Response(
            {
                "nb_projets": projets.count(),
                "montant_collecte": totaux["montant_collecte"] or Decimal("0.00"),
                "nb_donateurs": totaux["nb_donateurs"] or 0,
            }
        )


class ProjetImageViewSet(ModelViewSet):
    """Images de la kachel, carrousel auto-rotatif côté frontend (demande utilisateur
    point 1.1) — voir docstring de module."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetImageSerializer
    pagination_class = ProjetsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet"]
    queryset = ProjetImage.objects.select_related("projet", "uploaded_by")

    def perform_create(self, serializer):
        # has_object_permission n'est jamais appelée à la création (pas encore
        # d'instance) — même garde manuelle que CotisationViewSet.perform_create pour la
        # saisie pour autrui (voir apps.projets.permissions.est_gestionnaire_projet).
        projet = serializer.validated_data.get("projet")
        if projet is None or not est_gestionnaire_projet(self.request.user, projet):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter " "une image."
            )
        membre = getattr(self.request.user, "membre", None)
        serializer.save(uploaded_by=membre)


class ProjetMiseAJourViewSet(ModelViewSet):
    """Rapport d'avancement — "Was getan wurde" (demande utilisateur point 7) — voir
    docstring de module."""

    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetMiseAJourSerializer
    pagination_class = MisesAJourCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["projet"]
    queryset = ProjetMiseAJour.objects.select_related("projet", "created_by").prefetch_related(
        "images"
    )

    def perform_create(self, serializer):
        projet = serializer.validated_data.get("projet")
        if projet is None or not est_gestionnaire_projet(self.request.user, projet):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter "
                "une mise à jour."
            )
        membre = getattr(self.request.user, "membre", None)
        serializer.save(created_by=membre)


class ProjetMiseAJourImageViewSet(ModelViewSet):
    """Images jointes à une mise à jour du rapport (demande utilisateur point 7, "mit
    Bildern") — voir docstring de module. Pas de PATCH exposé : seuls l'ordre
    d'affichage/l'image elle-même n'ont pas de cas d'usage "modifier après coup" identifié
    dans la demande, contrairement au carrousel de la kachel (ProjetImage.ordre, réordonné
    en continu)."""

    http_method_names = ["get", "post", "delete", "head", "options"]
    permission_classes = [GestionContenuProjetPermission]
    serializer_class = ProjetMiseAJourImageSerializer
    pagination_class = ProjetsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["mise_a_jour"]
    queryset = ProjetMiseAJourImage.objects.select_related("mise_a_jour__projet")

    def perform_create(self, serializer):
        mise_a_jour = serializer.validated_data.get("mise_a_jour")
        if mise_a_jour is None or not est_gestionnaire_projet(
            self.request.user, mise_a_jour.projet
        ):
            raise PermissionDenied(
                "Seuls le Bureau Admin ou le responsable de ce projet peuvent ajouter " "une image."
            )
        serializer.save()

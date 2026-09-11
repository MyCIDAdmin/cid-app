"""
Vues API — app adhesions (FDD §6.1, TDD §4) :
  GET/POST  /adhesions/campagnes/              — catalogue des campagnes (lecture: tous ;
                                                    écriture: Bureau Admin+)
  GET       /adhesions/campagnes/{id}/
  GET       /adhesions/campagnes/active/        — campagne publiée en cours (ou 404)
  POST      /adhesions/campagnes/{id}/publier/  — brouillon -> publiée (Bureau Admin+)
  POST      /adhesions/campagnes/{id}/cloturer/ — publiée -> clôturée (Bureau Admin+)
  GET/POST  /adhesions/offres/                  — offres (lecture: tous ; écriture: Bureau Admin+)
  GET       /adhesions/offres/{id}/
  GET/POST  /adhesions/rabais/                  — rabais (lecture: tous ; écriture: Bureau Admin+)
  GET       /adhesions/souscriptions/           — liste (scope selon rôle, RH+ voit tout)
  GET       /adhesions/souscriptions/{id}/
  POST      /adhesions/souscriptions/souscrire/         — souscrire/modifier sa souscription
  GET       /adhesions/souscriptions/mes-souscriptions/ — mes souscriptions (toujours les siennes)

Pas de PUT/PATCH/DELETE sur Souscription : une fois créée, elle n'évolue que via son statut
(paiement, justificatif — AHM-20/AHM-46) ; une souscription payée ne peut jamais être
supprimée. Le prix et le statut de souscription sont entièrement recalculés côté serveur
(CLAUDE.md §8) — voir SouscrireSerializer.validate et souscrire() ci-dessous.

Périmètre AHM-19 : reçu PDF, tâches Celery Beat (relance/clôture auto), stats/export et
JustificatifRabais sont différés — voir models.py.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CampagneAdhesionFilter, OffreAdhesionFilter, SouscriptionFilter
from .models import (
    CampagneAdhesion,
    OffreAdhesion,
    RabaisOffre,
    Souscription,
    StatutCampagne,
    StatutSouscription,
)
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    READ_ALL_SOUSCRIPTIONS_MIN_LEVEL,
    CataloguePermission,
    SouscriptionPermission,
)
from .serializers import (
    CampagneAdhesionSerializer,
    OffreAdhesionSerializer,
    RabaisOffreSerializer,
    SouscrireSerializer,
    SouscriptionSerializer,
)


class AdhesionsCursorPagination(CursorPagination):
    """Pour les modèles avec created_at (CampagneAdhesion, Souscription)."""

    page_size = 20
    ordering = ("-created_at", "id")


class CataloguePagination(CursorPagination):
    """Pour OffreAdhesion / RabaisOffre — pas de created_at, tri catalogue stable."""

    page_size = 20
    ordering = ("id",)


class CampagneAdhesionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [CataloguePermission]
    serializer_class = CampagneAdhesionSerializer
    pagination_class = AdhesionsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CampagneAdhesionFilter
    queryset = CampagneAdhesion.objects.prefetch_related("offres", "offres__rabais").all()

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"created_by": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        serializer.save(created_by=membre)

    @action(detail=False, methods=["get"])
    def active(self, request):
        campagne = (
            self.get_queryset().filter(statut=StatutCampagne.PUBLIEE).order_by("-annee").first()
        )
        if campagne is None:
            raise NotFound("Aucune campagne d'adhésion n'est actuellement publiée.")
        return Response(self.get_serializer(campagne).data)

    @action(detail=True, methods=["post"])
    def publier(self, request, pk=None):
        campagne = self.get_object()
        if campagne.statut != StatutCampagne.BROUILLON:
            raise ValidationError({"statut": "Seule une campagne en brouillon peut être publiée."})
        campagne.statut = StatutCampagne.PUBLIEE
        try:
            # Savepoint dédié : sans lui, l'IntegrityError laisserait la transaction de la
            # requête dans un état "aborted" côté Postgres, empêchant toute requête ORM
            # ultérieure (y compris la sérialisation de la réponse d'erreur elle-même).
            with transaction.atomic():
                campagne.save(update_fields=["statut"])
        except IntegrityError as exc:
            raise ValidationError(
                {
                    "statut": (
                        "Une campagne est déjà publiée pour cette année — clôturez-la d'abord."
                    )
                }
            ) from exc
        return Response(self.get_serializer(campagne).data)

    @action(detail=True, methods=["post"])
    def cloturer(self, request, pk=None):
        campagne = self.get_object()
        if campagne.statut != StatutCampagne.PUBLIEE:
            raise ValidationError({"statut": "Seule une campagne publiée peut être clôturée."})
        campagne.statut = StatutCampagne.CLOTUREE
        campagne.save(update_fields=["statut"])
        return Response(self.get_serializer(campagne).data)


class OffreAdhesionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CataloguePermission]
    serializer_class = OffreAdhesionSerializer
    pagination_class = CataloguePagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = OffreAdhesionFilter

    def get_queryset(self):
        queryset = OffreAdhesion.objects.select_related("campagne").prefetch_related("rabais")
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        ):
            return queryset
        # Un membre normal ne voit que les offres visibles de campagnes publiées.
        return queryset.filter(visible=True, campagne__statut=StatutCampagne.PUBLIEE)


class RabaisOffreViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CataloguePermission]
    serializer_class = RabaisOffreSerializer
    pagination_class = CataloguePagination
    queryset = RabaisOffre.objects.select_related("offre").all()
    filterset_fields = ["offre"]


class SouscriptionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [SouscriptionPermission]
    serializer_class = SouscriptionSerializer
    pagination_class = AdhesionsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = SouscriptionFilter

    def get_queryset(self):
        queryset = Souscription.objects.select_related(
            "membre", "offre", "campagne", "rabais", "cotisation"
        ).all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL:
            return queryset
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    @action(detail=False, methods=["post"])
    def souscrire(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )

        serializer = SouscrireSerializer(data=request.data, context={"membre": membre})
        serializer.is_valid(raise_exception=True)
        offre = serializer.validated_data["offre"]
        rabais = serializer.validated_data.get("rabais")
        campagne = offre.campagne

        souscription, _created = Souscription.objects.get_or_create(
            membre=membre,
            campagne=campagne,
            defaults={"offre": offre, "prix_paye": 0},
        )
        if souscription.statut == StatutSouscription.PAYEE:
            raise PermissionDenied(
                "Cette souscription est déjà payée et ne peut plus être modifiée."
            )

        prix = rabais.calculer_prix(offre.prix_plein) if rabais else offre.prix_plein
        statut = (
            StatutSouscription.EN_ATTENTE_JUSTIFICATIF
            if rabais and rabais.justificatif_requis
            else StatutSouscription.EN_ATTENTE_PAIEMENT
        )

        souscription.offre = offre
        souscription.rabais = rabais
        souscription.prix_paye = prix
        souscription.statut = statut
        souscription.snapshot_avantages = offre.avantages
        souscription.date_souscription = timezone.now()
        souscription.save()

        return Response(SouscriptionSerializer(souscription).data)

    @action(detail=False, methods=["get"], url_path="mes-souscriptions")
    def mes_souscriptions(self, request):
        membre = getattr(request.user, "membre", None)
        queryset = (
            Souscription.objects.select_related("offre", "campagne", "rabais", "cotisation").filter(
                membre=membre
            )
            if membre
            else Souscription.objects.none()
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

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
  POST      /adhesions/souscriptions/{id}/annuler/      — stornieren/zurückziehen (demande
                                                            utilisateur du 2026-09-16) : le
                                                            membre propriétaire (non payée) ou
                                                            RH+/Bureau Admin
  POST      /adhesions/justificatifs/                — uploader un justificatif (multipart) ; RH+
                                                          peut aussi l'uploader pour le compte
                                                          d'un membre (demande utilisateur du
                                                          2026-09-16)
  GET       /adhesions/justificatifs/                — file d'attente de validation (RH+)
  GET       /adhesions/justificatifs/{id}/           — détail (RH+ ou membre propriétaire)
  GET       /adhesions/justificatifs/{id}/telecharger/ — URL MinIO pré-signée, TTL 15 min
  POST      /adhesions/justificatifs/{id}/valider/   — approuver/rejeter (RH+, motif si rejet)

Pas de PUT/PATCH/DELETE sur Souscription : une fois créée, elle n'évolue que via son statut
(paiement, justificatif, annulation — AHM-20/AHM-46, demande utilisateur du 2026-09-16) ; une
souscription payée ne peut jamais être supprimée ni annulée par cette action (voir annuler()
ci-dessous — un remboursement éventuel resterait un processus séparé, hors périmètre). Le prix
et le statut de souscription sont entièrement recalculés côté serveur (CLAUDE.md §8) — voir
SouscrireSerializer.validate et souscrire() ci-dessous.

Périmètre AHM-19/AHM-20 restant hors champ : reçu PDF, tâches Celery Beat (relance/clôture
auto), notifications (email/in-app), stats/export — voir models.py.
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import (
    CampagneAdhesionFilter,
    JustificatifRabaisFilter,
    OffreAdhesionFilter,
    SouscriptionFilter,
)
from .models import (
    CampagneAdhesion,
    JustificatifRabais,
    OffreAdhesion,
    RabaisOffre,
    Souscription,
    StatutCampagne,
    StatutJustificatif,
    StatutSouscription,
)
from .notifications import (
    notifier_justificatif_refuse,
    notifier_justificatif_valide,
    notifier_nouveau_justificatif_staff,
    notifier_souscription_annulee,
)
from .permissions import (
    GESTION_CATALOGUE_MIN_LEVEL,
    READ_ALL_SOUSCRIPTIONS_MIN_LEVEL,
    CataloguePermission,
    JustificatifPermission,
    SouscriptionPermission,
)
from .serializers import (
    CampagneAdhesionSerializer,
    JustificatifRabaisSerializer,
    JustificatifRabaisUploadSerializer,
    OffreAdhesionSerializer,
    RabaisOffreSerializer,
    SouscriptionSerializer,
    SouscrireSerializer,
    ValiderJustificatifSerializer,
)
from .services import synchroniser_cotisation
from .tasks import envoyer_annonce_campagne


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
        # Email + notification in-app à tous les membres actifs (ajouté le 2026-09-16, voir
        # tasks.py — même principe que EvenementViewSet.publier).
        envoyer_annonce_campagne.delay(str(campagne.id))
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


#: Statuts depuis lesquels une souscription peut être annulée/retirée (demande utilisateur du
#: 2026-09-16) — jamais "payee" (registre append-only, un remboursement suivrait un processus
#: séparé hors périmètre) ni "annulee"/"expiree" (déjà des états terminaux).
STATUTS_SOUSCRIPTION_ANNULABLES = {
    StatutSouscription.BROUILLON,
    StatutSouscription.EN_ATTENTE_JUSTIFICATIF,
    StatutSouscription.EN_ATTENTE_PAIEMENT,
    StatutSouscription.RABAIS_REFUSE,
}


class SouscriptionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [SouscriptionPermission]
    serializer_class = SouscriptionSerializer
    pagination_class = AdhesionsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = SouscriptionFilter

    def get_queryset(self):
        queryset = Souscription.objects.select_related(
            "membre", "offre", "campagne", "rabais", "cotisation", "justificatif"
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

        # Un justificatif déjà uploadé (ou déjà tranché par RH+) ne correspond plus à rien
        # si le membre change de rabais : JustificatifRabais n'a pas de FK propre vers
        # RabaisOffre (il hérite du rabais courant de la souscription), donc le conserver
        # laisserait soit une décision RH s'appliquer au nouveau rabais sans nouvelle
        # validation, soit un justificatif "en attente" bloquer tout ré-upload (contrainte
        # OneToOneField, voir models.py) pour un rabais qui n'est plus le bon. On le
        # supprime dès que le rabais change — un nouvel upload sera nécessaire si le
        # nouveau choix en requiert un.
        nouveau_rabais_id = rabais.id if rabais else None
        if not _created and souscription.rabais_id != nouveau_rabais_id:
            JustificatifRabais.objects.filter(souscription=souscription).delete()

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
        # Crée/actualise la Cotisation liée si un paiement est désormais dû dans l'immédiat, ou
        # annule celle en attente si ce n'est plus le cas (ajouté le 2026-09-19, voir services.py
        # — sans quoi une souscription en attente de paiement ne peut jamais apparaître dans
        # "Ausstehende Zahlungen").
        synchroniser_cotisation(souscription)

        return Response(SouscriptionSerializer(souscription).data)

    @action(detail=False, methods=["get"], url_path="mes-souscriptions")
    def mes_souscriptions(self, request):
        membre = getattr(request.user, "membre", None)
        queryset = (
            Souscription.objects.select_related(
                "offre", "campagne", "rabais", "cotisation", "justificatif"
            ).filter(membre=membre)
            if membre
            else Souscription.objects.none()
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        """
        Stornieren (RH+/Bureau Admin) ou zurückziehen (le membre propriétaire) — demande
        utilisateur du 2026-09-16 : une seule action côté serveur, la distinction se fait par le
        rôle de l'appelant (voir permissions.SouscriptionPermission.has_object_permission,
        get_object() ci-dessous applique déjà l'IDOR — un membre non-RH+ n'atteint même pas ici
        s'il ne s'agit pas de sa propre souscription). Jamais depuis "payee" (voir
        STATUTS_SOUSCRIPTION_ANNULABLES) : un remboursement resterait un processus séparé, hors
        périmètre.
        """
        souscription = self.get_object()
        if souscription.statut not in STATUTS_SOUSCRIPTION_ANNULABLES:
            raise ValidationError(
                {"statut": ("Cette souscription ne peut plus être annulée dans son statut actuel.")}
            )
        souscription.statut = StatutSouscription.ANNULEE
        souscription.save(update_fields=["statut"])
        # Annule la Cotisation liée si elle n'était pas encore payée (ajouté le 2026-09-19, voir
        # services.py) — jamais si elle l'était déjà : STATUTS_SOUSCRIPTION_ANNULABLES exclut déjà
        # "payee" ci-dessus, ce cas ne devrait donc jamais se présenter ici.
        synchroniser_cotisation(souscription)
        # Notification (ajoutée le 2026-09-16) uniquement quand ce n'est pas le membre
        # propriétaire qui vient d'annuler sa propre souscription ("zurückziehen") — voir
        # notifications.notifier_souscription_annulee.
        proprietaire_user = getattr(souscription.membre, "user", None)
        if proprietaire_user is not None and proprietaire_user.id != request.user.id:
            notifier_souscription_annulee(souscription)
        return Response(SouscriptionSerializer(souscription).data)


class JustificatifRabaisViewSet(ModelViewSet):
    """Justificatifs de rabais (AHM-20) — voir permissions.JustificatifPermission pour la
    matrice d'accès détaillée par action."""

    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [JustificatifPermission]
    serializer_class = (
        JustificatifRabaisSerializer  # list/retrieve — create/valider s'en écartent explicitement
    )
    pagination_class = AdhesionsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = JustificatifRabaisFilter
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        queryset = JustificatifRabais.objects.select_related(
            "souscription", "souscription__membre", "valide_par"
        ).all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL:
            return queryset
        membre = getattr(user, "membre", None)
        return queryset.filter(souscription__membre=membre) if membre else queryset.none()

    def get_throttles(self):
        # Limite dédiée (settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["justificatif_
        # upload"] = "10/hour") — uniquement sur l'upload, pas sur la consultation/validation.
        if self.action == "create":
            self.throttle_scope = "justificatif_upload"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        membre = getattr(request.user, "membre", None)
        # RH+/Bureau Admin peut uploader un justificatif pour le compte d'un membre — demande
        # utilisateur du 2026-09-16 ("Inklusive das hochladen des Beweisdokumentes beim
        # Rabatt-Vorteil"), analogue à ce que Django Admin permet déjà en laissant `fichier`
        # éditable (voir admin.py). Dans ce cas, pas besoin que l'appelant ait lui-même une
        # fiche membre (un compte RH pur reste valide) — voir validate_souscription côté
        # serializer, qui n'exige alors plus que la souscription appartienne à `membre`.
        est_rh_plus = ROLE_LEVELS.get(request.user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL
        if membre is None and not est_rh_plus:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )

        serializer = JustificatifRabaisUploadSerializer(
            data=request.data, context={"membre": membre, "est_rh_plus": est_rh_plus}
        )
        serializer.is_valid(raise_exception=True)
        souscription = serializer.validated_data["souscription"]

        # Ré-upload avant décision RH (validate() ci-dessus bloque déjà le cas "déjà
        # tranché") : on remplace le fichier sur l'enregistrement existant plutôt que
        # d'en créer un second, la souscription <-> justificatif étant en OneToOneField.
        existant = getattr(souscription, "justificatif", None)
        if existant is not None:
            existant.fichier = serializer.validated_data["fichier"]
            existant.type_justificatif = serializer.validated_data.get("type_justificatif", "")
            existant.save(update_fields=["fichier", "type_justificatif"])
            instance = existant
        else:
            instance = serializer.save()

        # Notification staff (ajoutée le 2026-09-16) — uniquement quand c'est le membre
        # lui-même qui soumet, jamais quand RH+ vient d'uploader pour son compte (voir
        # notifications.notifier_nouveau_justificatif_staff).
        if not est_rh_plus:
            notifier_nouveau_justificatif_staff(instance)

        return Response(JustificatifRabaisSerializer(instance).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def telecharger(self, request, pk=None):
        # URL MinIO pré-signée, TTL 15 min (FDD §9, storage.JustificatifsStorage) — jamais
        # d'URL publique permanente ; get_object() applique déjà has_object_permission
        # (RH+ ou membre propriétaire).
        justificatif = self.get_object()
        return Response({"url": justificatif.fichier.url, "expires_in": 900})

    @action(detail=True, methods=["post"])
    def valider(self, request, pk=None):
        justificatif = self.get_object()
        if justificatif.statut != StatutJustificatif.EN_ATTENTE:
            raise ValidationError({"statut": "Ce justificatif a déjà été traité."})

        souscription = justificatif.souscription
        if souscription.statut != StatutSouscription.EN_ATTENTE_JUSTIFICATIF:
            # Défense en profondeur : ne devrait pas arriver (souscrire() supprime le
            # justificatif dès que le rabais change), mais évite qu'une décision RH ne
            # fasse régresser une souscription déjà payée/annulée entre-temps.
            raise ValidationError(
                {"statut": "La souscription n'est plus en attente de validation de justificatif."}
            )

        decision_serializer = ValiderJustificatifSerializer(data=request.data)
        decision_serializer.is_valid(raise_exception=True)
        decision = decision_serializer.validated_data["decision"]
        motif_rejet = decision_serializer.validated_data["motif_rejet"]

        valideur = getattr(request.user, "membre", None)
        justificatif.statut = (
            StatutJustificatif.APPROUVE if decision == "approuve" else StatutJustificatif.REJETE
        )
        justificatif.motif_rejet = motif_rejet if decision == "rejete" else ""
        justificatif.valide_par = valideur
        justificatif.date_decision = timezone.now()
        justificatif.save(update_fields=["statut", "motif_rejet", "valide_par", "date_decision"])

        # FDD §4.2, étapes 4a/4b : approuvé -> prêt pour le paiement (au prix déjà réduit,
        # calculé au moment de souscrire()) ; rejeté -> le membre choisit prix plein ou
        # annulation.
        souscription.statut = (
            StatutSouscription.EN_ATTENTE_PAIEMENT
            if decision == "approuve"
            else StatutSouscription.RABAIS_REFUSE
        )
        souscription.save(update_fields=["statut"])
        # Crée la Cotisation liée si le rabais est approuvé (paiement désormais dû), ou annule
        # celle en attente si le rabais est rejeté et qu'une Cotisation avait déjà été créée pour
        # un rabais précédent (ajouté le 2026-09-19, voir services.py).
        synchroniser_cotisation(souscription)

        # Notification (ajoutée le 2026-09-16) — voir notifications.py.
        if decision == "approuve":
            notifier_justificatif_valide(justificatif)
        else:
            notifier_justificatif_refuse(justificatif)

        return Response(JustificatifRabaisSerializer(justificatif).data)

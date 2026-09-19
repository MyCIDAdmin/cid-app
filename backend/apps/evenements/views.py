"""
Vues API — app evenements (FDD §3.4/F-005/F-006/F-007) :
  GET/POST   /evenements/evenements/                — catalogue (lecture: tous — brouillons
                                                        réservés Bureau Admin+ ; écriture:
                                                        Bureau Admin+)
  GET        /evenements/evenements/{id}/
  POST       /evenements/evenements/{id}/publier/    — brouillon -> publié (Bureau Admin+)
  POST       /evenements/evenements/{id}/annuler/    — -> annulé (Bureau Admin+)
  POST       /evenements/evenements/inscrire/        — s'inscrire (capacité vérifiée
                                                        atomiquement, SELECT FOR UPDATE)
  GET        /evenements/inscriptions/               — scope selon rôle (Bureau Admin+ voit
                                                        tout, sinon les siennes)
  POST       /evenements/inscriptions/{id}/annuler/  — annuler sa propre inscription (ou
                                                        Bureau Admin+) — libère la capacité
                                                        (recalculée dynamiquement, voir
                                                        models.Evenement.places_reservees)
  GET/POST   /evenements/covoiturages/               — trajets (lecture: tous ; écriture
                                                        limitée au conducteur/Bureau Admin+)
  POST       /evenements/covoiturages/{id}/rejoindre/ — rejoindre un trajet (capacité
                                                        vérifiée atomiquement)
  GET        /evenements/reservations-covoiturage/   — scope selon rôle

Le montant/la capacité sont toujours recalculés côté serveur (CLAUDE.md §8) — voir
EvenementViewSet.inscrire et CovoiturageViewSet.rejoindre pour le verrouillage
transactionnel (même principe que le stock atomique boutique, appliqué ici à la capacité).
"""

from django.db import transaction
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CovoiturageFilter, EvenementFilter, InscriptionFilter
from .models import (
    Covoiturage,
    Evenement,
    Inscription,
    ReservationCovoiturage,
    StatutEvenement,
    StatutInscription,
    StatutReservationCovoiturage,
)
from .permissions import (
    GESTION_EVENEMENTS_MIN_LEVEL,
    CovoiturageWritePermission,
    EvenementPermission,
    InscriptionPermission,
    ReservationCovoituragePermission,
)
from .serializers import (
    CovoiturageSerializer,
    EvenementSerializer,
    InscriptionSerializer,
    InscrireSerializer,
    RejoindreTrajetSerializer,
    ReservationCovoiturageSerializer,
)
from .services import synchroniser_cotisation
from .tasks import envoyer_annulation_evenement, envoyer_invitations_evenement


class EvenementsCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class EvenementViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [EvenementPermission]
    serializer_class = EvenementSerializer
    pagination_class = EvenementsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = EvenementFilter

    def get_queryset(self):
        queryset = Evenement.objects.select_related("organisateur", "created_by").all()
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL
        ):
            return queryset
        return queryset.filter(statut=StatutEvenement.PUBLIE)

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"created_by": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        serializer.save(
            created_by=membre, organisateur=serializer.validated_data.get("organisateur", membre)
        )

    @action(detail=True, methods=["post"])
    def publier(self, request, pk=None):
        evenement = self.get_object()
        if evenement.statut != StatutEvenement.BROUILLON:
            raise ValidationError({"statut": "Seul un événement en brouillon peut être publié."})
        evenement.statut = StatutEvenement.PUBLIE
        evenement.save(update_fields=["statut"])
        # W-004 (Phase 2B) : invitation email + notification in-app à tous les membres actifs.
        envoyer_invitations_evenement.delay(str(evenement.id))
        return Response(self.get_serializer(evenement).data)

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        evenement = self.get_object()
        if evenement.statut == StatutEvenement.ANNULE:
            raise ValidationError({"statut": "Cet événement est déjà annulé."})
        evenement.statut = StatutEvenement.ANNULE
        evenement.save(update_fields=["statut"])
        # Email + notification in-app à chaque inscrit non annulé (ajouté le 2026-09-16).
        envoyer_annulation_evenement.delay(str(evenement.id))
        return Response(self.get_serializer(evenement).data)

    @action(detail=False, methods=["post"])
    def inscrire(self, request):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )

        serializer = InscrireSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        places_demandees = serializer.validated_data["places"]

        with transaction.atomic():
            # select_for_update verrouille la ligne Evenement pour la durée de la
            # transaction : deux inscriptions concurrentes sur le même événement sont
            # sérialisées, la vérification de capacité ci-dessous est donc fiable (même
            # principe que le stock atomique boutique, voir apps.boutique.views).
            evenement = Evenement.objects.select_for_update().get(
                pk=serializer.validated_data["evenement"].pk
            )
            if evenement.statut != StatutEvenement.PUBLIE:
                raise ValidationError(
                    {"evenement": "Cet événement n'est pas ouvert aux inscriptions."}
                )

            inscription, created = Inscription.objects.get_or_create(
                evenement=evenement,
                membre=membre,
                defaults={"places": 0, "statut": StatutInscription.CONFIRMEE},
            )
            if inscription.statut != StatutInscription.ANNULEE:
                places_existantes = inscription.places
            else:
                places_existantes = 0

            if evenement.places_max is not None:
                places_autres = evenement.places_reservees - places_existantes
                if places_autres + places_demandees > evenement.places_max:
                    raise ValidationError(
                        {
                            "places": (
                                "Capacité insuffisante : "
                                f"{max(evenement.places_max - places_autres, 0)} place(s) "
                                "disponible(s)."
                            )
                        }
                    )

            inscription.places = places_demandees
            inscription.regime_alimentaire = serializer.validated_data.get(
                "regime_alimentaire", inscription.regime_alimentaire
            )
            inscription.remarques = serializer.validated_data.get("remarques", "")
            inscription.montant_paye = evenement.cout * places_demandees
            inscription.statut = (
                StatutInscription.CONFIRMEE
                if evenement.gratuit or evenement.cout == 0
                else StatutInscription.EN_ATTENTE_PAIEMENT
            )
            inscription.save()
            # Crée/actualise la Cotisation liée si un paiement est désormais dû dans l'immédiat
            # (ajouté le 2026-09-20, voir services.py — sans quoi une inscription payante ne
            # pouvait jamais être réglée en libre-service). Toujours dans la même transaction
            # que select_for_update() ci-dessus : la Cotisation créée est donc, elle aussi,
            # cohérente avec la capacité/le montant vérifiés atomiquement.
            synchroniser_cotisation(inscription)

        return Response(InscriptionSerializer(inscription).data)


class InscriptionViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [InscriptionPermission]
    serializer_class = InscriptionSerializer
    pagination_class = EvenementsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = InscriptionFilter

    def get_queryset(self):
        queryset = Inscription.objects.select_related("evenement", "membre", "cotisation").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL:
            return queryset
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        inscription = self.get_object()
        if inscription.statut == StatutInscription.ANNULEE:
            raise ValidationError({"statut": "Cette inscription est déjà annulée."})
        inscription.statut = StatutInscription.ANNULEE
        inscription.save(update_fields=["statut"])
        # Annule la Cotisation liée si elle n'était pas encore payée (ajouté le 2026-09-20, voir
        # services.py) — ne touche jamais une Cotisation déjà payee (synchroniser_cotisation ne
        # touche que en_attente/echouee), même philosophie que l'annulation d'une Souscription
        # adhésion (apps.adhesions.views.SouscriptionViewSet.annuler).
        synchroniser_cotisation(inscription)
        return Response(self.get_serializer(inscription).data)


class CovoiturageViewSet(ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    permission_classes = [CovoiturageWritePermission]
    serializer_class = CovoiturageSerializer
    pagination_class = EvenementsCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CovoiturageFilter
    queryset = Covoiturage.objects.select_related("conducteur", "evenement").all()

    def perform_create(self, serializer):
        membre = getattr(self.request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"conducteur": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        serializer.save(conducteur=membre)

    @action(detail=True, methods=["post"])
    def rejoindre(self, request, pk=None):
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )

        serializer = RejoindreTrajetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        places_demandees = serializer.validated_data["places_reservees"]

        with transaction.atomic():
            trajet = Covoiturage.objects.select_for_update().get(pk=pk)
            if trajet.conducteur_id == membre.id:
                raise PermissionDenied("Vous ne pouvez pas rejoindre votre propre trajet.")

            reservation, _created = ReservationCovoiturage.objects.get_or_create(
                trajet=trajet,
                membre=membre,
                defaults={"places_reservees": 0},
            )
            places_existantes = (
                reservation.places_reservees
                if reservation.statut != StatutReservationCovoiturage.ANNULEE
                else 0
            )
            places_autres = trajet.places_reservees - places_existantes
            if places_autres + places_demandees > trajet.places_disponibles:
                raise ValidationError(
                    {
                        "places_reservees": (
                            "Places insuffisantes : "
                            f"{max(trajet.places_disponibles - places_autres, 0)} "
                            "disponible(s)."
                        )
                    }
                )

            reservation.places_reservees = places_demandees
            reservation.point_prise_en_charge = serializer.validated_data.get(
                "point_prise_en_charge", ""
            )
            reservation.statut = StatutReservationCovoiturage.CONFIRMEE
            reservation.save()

        return Response(ReservationCovoiturageSerializer(reservation).data)


class ReservationCovoiturageViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [ReservationCovoituragePermission]
    serializer_class = ReservationCovoiturageSerializer
    pagination_class = EvenementsCursorPagination
    filterset_fields = ["trajet"]

    def get_queryset(self):
        queryset = ReservationCovoiturage.objects.select_related("trajet", "membre").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL:
            return queryset
        membre = getattr(user, "membre", None)
        if membre is None:
            return queryset.none()
        return queryset.filter(Q(membre=membre) | Q(trajet__conducteur=membre))

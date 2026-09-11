"""
Vues API — app cotisations (TDD §2.4) :
  GET   /cotisations/           — liste (scope selon rôle, RH+ voit tout)
  POST  /cotisations/           — enregistrer un paiement (libre-service, ou pour autrui si DG+)
  GET   /cotisations/{id}/      — détail (scope selon rôle)
  GET   /cotisations/{id}/receipt/  — reçu PDF (AHM-17, RICEFW R-010/W-002)

Pas de PUT/PATCH/DELETE : registre financier append-only (voir models.py).
"""

from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.viewsets import ModelViewSet

from apps.accounts.models import ROLE_LEVELS

from .filters import CotisationFilter
from .models import Cotisation, StatutCotisation
from .pdf import generate_receipt_pdf
from .permissions import READ_ALL_MIN_LEVEL, SAISIE_POUR_AUTRUI_MIN_LEVEL, CotisationPermission
from .serializers import CotisationSerializer


class CotisationCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "id")


class CotisationViewSet(ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    permission_classes = [CotisationPermission]
    serializer_class = CotisationSerializer
    pagination_class = CotisationCursorPagination
    filter_backends = [DjangoFilterBackend]
    filterset_class = CotisationFilter

    def get_queryset(self):
        queryset = Cotisation.objects.select_related("membre", "saisie_par").all()
        user = self.request.user
        if not user or not user.is_authenticated:
            return queryset.none()
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_MIN_LEVEL:
            return queryset
        # Protection IDOR (SCD §2.3 A01) : sous RH, uniquement les cotisations de sa propre
        # fiche membre (si elle existe et est liée à son compte).
        membre = getattr(user, "membre", None)
        return queryset.filter(membre=membre) if membre else queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        membre_self = getattr(user, "membre", None)
        membre_cible = serializer.validated_data.get("membre")

        if membre_cible and membre_cible != membre_self:
            if ROLE_LEVELS.get(user.role, 0) < SAISIE_POUR_AUTRUI_MIN_LEVEL:
                raise PermissionDenied(
                    "Seuls le Directeur Financier ou l'Administrateur peuvent enregistrer une "
                    "transaction pour le compte d'un autre membre."
                )
            serializer.save(membre=membre_cible, saisie_par=membre_self)
            return

        if membre_self is None:
            raise ValidationError(
                {"membre": "Aucune fiche membre associée à ce compte utilisateur."}
            )
        serializer.save(membre=membre_self, saisie_par=None)

    @action(detail=True, methods=["get"])
    def receipt(self, request, pk=None):
        """
        GET /cotisations/{id}/receipt/ — reçu PDF (AHM-17). get_object() applique le même
        scope IDOR que list/retrieve (CotisationPermission.has_object_permission) : propriétaire
        ou RH+ uniquement.
        """
        cotisation = self.get_object()
        if cotisation.statut != StatutCotisation.PAYEE:
            raise ValidationError(
                "Le reçu n'est disponible que pour une cotisation payée "
                f"(statut actuel : {cotisation.get_statut_display()})."
            )

        pdf_bytes = generate_receipt_pdf(cotisation)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = (
            f'attachment; filename="recu-{cotisation.reference_transaction}.pdf"'
        )
        return response

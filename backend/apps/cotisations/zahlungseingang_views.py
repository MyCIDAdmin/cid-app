"""API der importierten Zahlungseingänge und ihres Excel-Imports (Release 3, 2026-10-12).

Zugriff über die Matrix der Rollenverwaltung (Seite `page_zahlungen_import`): Lesen = `lecture`,
Ändern/Buchen/Importieren = `lecture_ecriture`. Endpunkte (Präfix /api/v1/cotisations/) :
  GET    zahlungseingaenge/            Liste (Filter status, q)
  PATCH  zahlungseingaenge/<id>/       offenen Eintrag korrigieren, zuordnen, ergänzen
  POST   zahlungseingaenge/<id>/buchen/      -> bezahlte Cotisation
  POST   zahlungseingaenge/<id>/verwerfen/   -> ausblenden (nie löschen)
  POST   zahlungseingaenge/<id>/wiederherstellen/
  POST   import-zahlungen/pruefen|bestaetigen/, GET import-zahlungen/template/
"""

from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.mixins import ListModelMixin, RetrieveModelMixin, UpdateModelMixin
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import GenericViewSet

from apps.membres.import_views import _ImportBestaetigenBasis, _ImportPruefenBasis
from apps.membres.models import Membre
from apps.membres.utils_http import xlsx_response
from apps.rbac.permissions import page_admin_permission

from .imports_zahlungen import (
    analyser_zahlungen,
    ausfuehren_zahlungen,
    construire_classeur_template_zahlungen,
)
from .models import StatutZahlungseingang, Zahlungseingang
from .zahlungseingang_services import ARTIKEL_ERLAUBT, buchen, fehlende_angaben

ZahlungsImportPermission = page_admin_permission("page_zahlungen_import")


class MembreKurzSerializer(serializers.ModelSerializer):
    class Meta:
        model = Membre
        fields = ["id", "numero_membre", "prenom", "nom", "email"]


class ZahlungseingangSerializer(serializers.ModelSerializer):
    membre_info = MembreKurzSerializer(source="membre", read_only=True)
    membre = serializers.PrimaryKeyRelatedField(
        queryset=Membre.objects.all(), allow_null=True, required=False
    )
    fehlt = serializers.SerializerMethodField()

    class Meta:
        model = Zahlungseingang
        fields = [
            "id", "datum", "betrag", "mode_paiement", "referenz", "verwendungszweck",
            "membre", "membre_info", "type_article", "annee", "libelle", "status",
            "cotisation", "hinweis", "quelle_datei", "fehlt", "created_at",
        ]  # fmt: skip
        read_only_fields = ["id", "status", "cotisation", "hinweis", "quelle_datei", "created_at"]

    def get_fehlt(self, obj) -> list[str]:
        return fehlende_angaben(obj) if obj.status == StatutZahlungseingang.OFFEN else []

    def validate_type_article(self, wert):
        if wert and wert not in ARTIKEL_ERLAUBT:
            raise serializers.ValidationError("Artikel nicht erlaubt.")
        return wert

    def validate(self, attrs):
        if self.instance is not None and self.instance.status != StatutZahlungseingang.OFFEN:
            raise serializers.ValidationError("Nur offene Zahlungseingänge können geändert werden.")
        return attrs


class ZahlungseingangPagination(PageNumberPagination):
    page_size = 50


class ZahlungseingangViewSet(ListModelMixin, RetrieveModelMixin, UpdateModelMixin, GenericViewSet):
    http_method_names = ["get", "patch", "post", "head", "options"]
    permission_classes = [ZahlungsImportPermission]
    serializer_class = ZahlungseingangSerializer
    pagination_class = ZahlungseingangPagination

    def get_queryset(self):
        qs = Zahlungseingang.objects.select_related("membre")
        status_filter = self.request.query_params.get("status")
        if status_filter in StatutZahlungseingang.values:
            qs = qs.filter(status=status_filter)
        suche = (self.request.query_params.get("q") or "").strip()
        if suche:
            qs = qs.filter(
                Q(referenz__icontains=suche)
                | Q(verwendungszweck__icontains=suche)
                | Q(membre__nom__icontains=suche)
                | Q(membre__prenom__icontains=suche)
                | Q(membre__email__icontains=suche)
            )
        return qs

    @action(detail=True, methods=["post"])
    def buchen(self, request, pk=None):
        eingang = self.get_object()
        try:
            buchen(eingang, getattr(request.user, "membre", None))
        except ValueError as exc:
            return Response(
                {"code": "nicht_buchbar", "message": str(exc), "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        eingang.refresh_from_db()
        return Response(self.get_serializer(eingang).data)

    def _status_wechseln(self, request, von, nach):
        eingang = self.get_object()
        if eingang.status != von:
            return Response(
                {"code": "status_ungueltig", "message": "Status passt nicht.", "details": {}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        eingang.status = nach
        eingang.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(eingang).data)

    @action(detail=True, methods=["post"])
    def verwerfen(self, request, pk=None):
        return self._status_wechseln(
            request, StatutZahlungseingang.OFFEN, StatutZahlungseingang.VERWORFEN
        )

    @action(detail=True, methods=["post"])
    def wiederherstellen(self, request, pk=None):
        return self._status_wechseln(
            request, StatutZahlungseingang.VERWORFEN, StatutZahlungseingang.OFFEN
        )


class ZahlungsImportPruefenView(_ImportPruefenBasis):
    permission_classes = [ZahlungsImportPermission]
    analysieren = staticmethod(analyser_zahlungen)
    mit_importeur = True


class ZahlungsImportBestaetigenView(_ImportBestaetigenBasis):
    permission_classes = [ZahlungsImportPermission]
    ausfuehren = staticmethod(ausfuehren_zahlungen)
    mit_importeur = True


class ZahlungsImportTemplateView(APIView):
    """GET import-zahlungen/template/ — Excel-Vorlage."""

    permission_classes = [ZahlungsImportPermission]

    def get(self, request):
        return xlsx_response(
            construire_classeur_template_zahlungen(), "template_import_zahlungen.xlsx"
        )

"""API der Fähigkeiten-Datenbank (Release 9).

- GET/POST  /membres/faehigkeiten/          Katalog lesen / eigene anlegen (jedes Mitglied)
- DELETE    /membres/faehigkeiten/{id}/     Eigenen (nicht Standard-)Eintrag entfernen — ab RH
- GET/PUT   /membres/mes-faehigkeiten/      Meine Fähigkeiten lesen / ersetzen
- GET       /membres/reporting/faehigkeiten/        „Wer kann wo helfen?“ — ab RH
- GET       /membres/reporting/faehigkeiten/export/ Excel-Export derselben Auswahl — ab RH
"""

from django.db import IntegrityError, transaction
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsRHOrAbove

from .faehigkeiten import bericht, normalisiere_bezeichnung
from .models import Faehigkeit, FaehigkeitKategorie, MembreFaehigkeit
from .utils_http import safe_zeile, xlsx_response

MAX_FAEHIGKEITEN_PRO_MITGLIED = 40


class FaehigkeitSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faehigkeit
        fields = ["id", "bezeichnung", "kategorie", "ist_standard"]
        read_only_fields = ["id", "ist_standard"]
        extra_kwargs = {"bezeichnung": {"max_length": 80}}

    def validate_bezeichnung(self, wert):
        wert = normalisiere_bezeichnung(wert)
        if len(wert) < 2:
            raise serializers.ValidationError("Mindestens 2 Zeichen.")
        return wert


def _membre(request):
    membre = getattr(request.user, "membre", None)
    if membre is None:
        raise ValidationError({"membre": "Kein Mitglied mit diesem Konto verknüpft."})
    return membre


class FaehigkeitListeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        daten = FaehigkeitSerializer(Faehigkeit.objects.all(), many=True).data
        return Response(
            {
                "kategorien": [{"id": k, "label": str(l)} for k, l in FaehigkeitKategorie.choices],
                "ergebnisse": daten,
            }
        )

    def post(self, request):
        membre = _membre(request)
        serializer = FaehigkeitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bezeichnung = serializer.validated_data["bezeichnung"]
        vorhanden = Faehigkeit.objects.filter(bezeichnung__iexact=bezeichnung).first()
        if vorhanden:
            return Response(FaehigkeitSerializer(vorhanden).data, status=status.HTTP_200_OK)
        try:
            with transaction.atomic():
                neu = serializer.save(erstellt_von=membre, ist_standard=False)
        except IntegrityError:  # gleichzeitiger Doppelanlage
            neu = Faehigkeit.objects.get(bezeichnung__iexact=bezeichnung)
            return Response(FaehigkeitSerializer(neu).data, status=status.HTTP_200_OK)
        return Response(FaehigkeitSerializer(neu).data, status=status.HTTP_201_CREATED)


class FaehigkeitLoeschenView(APIView):
    permission_classes = [IsRHOrAbove]

    def delete(self, request, pk):
        try:
            eintrag = Faehigkeit.objects.get(pk=pk)
        except (Faehigkeit.DoesNotExist, ValueError, ValidationError):
            raise NotFound()
        if eintrag.ist_standard:
            raise ValidationError({"detail": "Standard-Fähigkeiten können nicht gelöscht werden."})
        eintrag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeineFaehigkeitSerializer(serializers.Serializer):
    faehigkeit = serializers.PrimaryKeyRelatedField(queryset=Faehigkeit.objects.all())
    kommentar = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")


class MeineFaehigkeitenView(APIView):
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _antwort(membre):
        zeilen = membre.faehigkeiten.select_related("faehigkeit")
        return Response(
            {
                "faehigkeiten": [
                    {"faehigkeit": str(z.faehigkeit_id), "kommentar": z.kommentar} for z in zeilen
                ]
            }
        )

    def get(self, request):
        return self._antwort(_membre(request))

    def put(self, request):
        membre = _membre(request)
        serializer = MeineFaehigkeitSerializer(data=request.data.get("faehigkeiten", []), many=True)
        serializer.is_valid(raise_exception=True)
        eintraege = {str(e["faehigkeit"].pk): e for e in serializer.validated_data}
        if len(eintraege) > MAX_FAEHIGKEITEN_PRO_MITGLIED:
            raise ValidationError(
                {"faehigkeiten": f"Höchstens {MAX_FAEHIGKEITEN_PRO_MITGLIED} Fähigkeiten."}
            )
        with transaction.atomic():
            membre.faehigkeiten.exclude(faehigkeit_id__in=list(eintraege)).delete()
            for fid, e in eintraege.items():
                MembreFaehigkeit.objects.update_or_create(
                    membre=membre,
                    faehigkeit=e["faehigkeit"],
                    defaults={"kommentar": normalisiere_bezeichnung(e.get("kommentar", ""))},
                )
        return self._antwort(membre)


class FaehigkeitenReportingView(APIView):
    permission_classes = [IsRHOrAbove]

    def get(self, request):
        return Response(bericht(request.query_params))


class FaehigkeitenReportingExportView(APIView):
    permission_classes = [IsRHOrAbove]

    def get(self, request):
        daten = bericht(request.query_params)
        mappe = Workbook()
        blatt = mappe.active
        blatt.title = "Wer kann wo helfen"
        kopf = [
            "Kategorie",
            "Fähigkeit",
            "Mitglied",
            "Mitgliedsnr.",
            "Status",
            "E-Mail",
            "Stadt",
            "Anmerkung",
        ]
        blatt.append(kopf)
        for zelle in blatt[1]:
            zelle.font = Font(bold=True)
        labels = {k: str(l) for k, l in FaehigkeitKategorie.choices}
        for e in daten["ergebnisse"]:
            for m in e["mitglieder"]:
                blatt.append(
                    safe_zeile(
                        [
                            labels.get(e["kategorie"], e["kategorie"]),
                            e["bezeichnung"],
                            m["nom_complet"],
                            m["numero_membre"],
                            m["statut"],
                            m["email"],
                            m["ville"],
                            m["kommentar"],
                        ]
                    )
                )
        for spalte, breite in zip("ABCDEFGH", (24, 28, 28, 14, 14, 32, 18, 40)):
            blatt.column_dimensions[spalte].width = breite
        return xlsx_response(mappe, f"faehigkeiten_{timezone.localtime():%Y%m%d_%H%M}.xlsx")

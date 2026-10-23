"""API des Einlasses (Scan-Seite). Rechte siehe `einlass.darf_scannen` / `ist_verantwortlich`."""

import uuid

from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.membres.utils_http import xlsx_response

from . import einlass


class MeineEinlassView(APIView):
    """Veranstaltungen, bei denen ich den Einlass machen darf."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"ergebnisse": einlass.meine_ziele(request.user)})


class EinlassUebersichtView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        einlass.darf_scannen(request.user, ziel)
        daten = einlass.uebersicht(ziel)
        verantwortlich = einlass.ist_verantwortlich(request.user, ziel)
        daten["darf_helfer_verwalten"] = verantwortlich
        daten["darf_exportieren"] = verantwortlich
        return Response(daten)


class EinlassPruefenView(APIView):
    """Schlägt einen gescannten Code nach, ohne etwas zu buchen."""

    permission_classes = [IsAuthenticated]

    def post(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        einlass.darf_scannen(request.user, ziel)
        code = request.data.get("code")
        if not isinstance(code, str):
            raise ValidationError({"code": "Code erwartet."})
        return Response(einlass.pruefen(ziel, code))


class EinlassBuchenView(APIView):
    """Lässt so viele Personen eines Tickets herein (Teil-Einlass möglich)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        einlass.darf_scannen(request.user, ziel)
        person = request.data.get("person")
        try:
            person = str(uuid.UUID(person))
        except (ValueError, TypeError, AttributeError):
            raise ValidationError({"person": "Ungültige Person."})
        stand = einlass.einlassen(
            ziel,
            request.user,
            person,
            request.data.get("erwachsene", 0),
            request.data.get("kinder", 0),
        )
        letzter = einlass.letzter_eintrag(request.user, person)
        return Response({"stand": stand, "einlass": str(letzter.pk) if letzter else None})


class EinlassExportView(APIView):
    """Excel-Liste der Anwesenheit (nur Büro/Verantwortliche, nicht für Helfer). Der Abruf
    erscheint automatisch im Aktivitätsprotokoll (Pfad enthält „export“)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        if not einlass.ist_verantwortlich(request.user, ziel):
            raise PermissionDenied()
        classeur, dateiname = einlass.export_xlsx(ziel)
        return xlsx_response(classeur, dateiname)


class EinlassRuecknahmeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        return Response({"stand": einlass.ruecknahme(request.user, pk)})


class EinlassHelferView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        if not einlass.ist_verantwortlich(request.user, ziel):
            raise PermissionDenied()
        return Response({"ergebnisse": einlass.helfer_liste(ziel)})

    def post(self, request, typ, pk):
        ziel = einlass.ziel_holen(typ, pk)
        einlass.helfer_benennen(ziel, request.user, request.data.get("email"))
        return Response({"ergebnisse": einlass.helfer_liste(ziel)}, status=201)


class EinlassHelferLoeschenView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, typ, pk, helfer_id):
        ziel = einlass.ziel_holen(typ, pk)
        einlass.helfer_entfernen(ziel, request.user, helfer_id)
        return Response({"ergebnisse": einlass.helfer_liste(ziel)})

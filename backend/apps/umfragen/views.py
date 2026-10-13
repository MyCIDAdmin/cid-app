"""Umfragen (Release 11).

  GET/POST          /umfragen/                       Liste (je Zielgruppe) / anlegen
  GET/PATCH/DELETE  /umfragen/{id}/
  GET               /umfragen/{id}/oeffentlich/      Minimalansicht ohne Anmeldung (geteilter Link)
  POST              /umfragen/{id}/teilnehmen/       Antworten abgeben (einmal pro Konto)
  GET               /umfragen/{id}/ergebnisse/       je nach Ergebnis-Modus
  POST              /umfragen/{id}/veroeffentlichen|zurueckziehen/
  POST              /umfragen/{id}/ankuendigen/      als „Wichtig“ in den Neuigkeiten
  POST/DELETE       /umfragen/{id}/bild/             Titelbild
Anlegen/Ändern/Veröffentlichen: Seite „page_quiz“ mit Schreibrecht ; Ergebnisse (alles, bei
namentlichen Umfragen mit Namen): Seite „page_quiz“ mit Leserecht.
"""

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse
from django.utils.html import escape
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import action, parser_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from apps.communaute.models import Publication
from apps.communaute.tasks import notifier_publication_importante

from .models import (
    FrageTyp,
    Umfrage,
    UmfrageAntwort,
    UmfrageEinreichung,
    UmfrageTeilnahme,
    Zielgruppe,
)
from .pdf import erzeuge_bericht_pdf
from .serializers import (
    BildSerializer,
    TeilnahmeEingabeSerializer,
    UmfrageOeffentlichSerializer,
    UmfrageSerializer,
)
from .services import (
    darf_teilnehmen,
    ist_aktives_mitglied,
    ist_verwaltung,
    kann_ergebnisse_sehen,
    uebersetzungen_fuer_umfrage,
)

SCHREIB_AKTIONEN = {
    "create",
    "update",
    "partial_update",
    "destroy",
    "veroeffentlichen",
    "zurueckziehen",
    "ankuendigen",
    "bild",
}


class UmfragePermission(BasePermission):
    def has_permission(self, request, view):
        if view.action == "oeffentlich":
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if view.action in SCHREIB_AKTIONEN:
            return ist_verwaltung(user, schreiben=True)
        return True


class UmfrageViewSet(ModelViewSet):
    serializer_class = UmfrageSerializer
    permission_classes = [UmfragePermission]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        queryset = Umfrage.objects.prefetch_related("fragen__optionen", "teilnahmen")
        if self.action == "oeffentlich":
            return queryset.filter(veroeffentlicht=True)
        user = self.request.user
        if ist_verwaltung(user):
            return queryset
        queryset = queryset.filter(veroeffentlicht=True)
        if not ist_aktives_mitglied(user):
            queryset = queryset.filter(zielgruppe=Zielgruppe.KONTEN)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.einreichungen.exists():
            raise ValidationError(
                "Umfragen mit Teilnahmen können nicht gelöscht werden – bitte zurückziehen."
            )
        instance.delete()

    # --- Besucher ----------------------------------------------------------------------
    @action(detail=True, methods=["get"], permission_classes=[AllowAny])
    def oeffentlich(self, request, pk=None):
        return Response(
            UmfrageOeffentlichSerializer(self.get_object(), context={"request": request}).data
        )

    @action(detail=True, methods=["post"])
    def teilnehmen(self, request, pk=None):
        umfrage = self.get_object()
        user = request.user
        if not umfrage.veroeffentlicht or not darf_teilnehmen(user, umfrage):
            raise PermissionDenied("Du kannst an dieser Umfrage nicht teilnehmen.")
        if umfrage.abgelaufen:
            raise ValidationError("Die Frist dieser Umfrage ist abgelaufen.")
        eingabe = TeilnahmeEingabeSerializer(data=request.data)
        eingabe.is_valid(raise_exception=True)
        antworten = {str(a["frage"]): a for a in eingabe.validated_data["antworten"]}

        zeilen = []
        for frage in umfrage.fragen.all():
            antwort = antworten.get(str(frage.id), {})
            optionen = {str(o) for o in antwort.get("optionen", [])}
            text = (antwort.get("text") or "").strip()
            if frage.typ == FrageTyp.FREITEXT:
                if not text:
                    if frage.pflicht:
                        raise ValidationError({str(frage.id): "Bitte beantworten."})
                    continue
                zeilen.append((frage, None, text))
                continue
            gueltig = {str(o.id): o for o in frage.optionen.all()}
            if not optionen <= gueltig.keys():
                raise ValidationError({str(frage.id): "Ungültige Antwortmöglichkeit."})
            kommentar = text if frage.freitext_zusatz else ""
            if not optionen:
                if frage.pflicht:
                    raise ValidationError({str(frage.id): "Bitte beantworten."})
                if kommentar:
                    zeilen.append((frage, None, kommentar))
                continue
            if frage.typ == FrageTyp.EINZEL and len(optionen) != 1:
                raise ValidationError({str(frage.id): "Bitte genau eine Antwort wählen."})
            zeilen.extend((frage, gueltig[o], "") for o in optionen)
            if kommentar:
                zeilen.append((frage, None, kommentar))
        if not zeilen:
            raise ValidationError("Bitte mindestens eine Frage beantworten.")

        try:
            with transaction.atomic():
                UmfrageTeilnahme.objects.create(umfrage=umfrage, user=user)
                einreichung = UmfrageEinreichung.objects.create(
                    umfrage=umfrage, user=None if umfrage.anonym else user
                )
                UmfrageAntwort.objects.bulk_create(
                    UmfrageAntwort(einreichung=einreichung, frage=f, option=o, freitext=t)
                    for f, o, t in zeilen
                )
        except IntegrityError:
            raise ValidationError("Du hast an dieser Umfrage bereits teilgenommen.") from None
        return Response({"teilgenommen": True}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def ergebnisse(self, request, pk=None):
        return Response(self._ergebnis_daten(self.get_object(), request.user))

    @action(detail=True, methods=["get"])
    def bericht(self, request, pk=None):
        """PDF-Bericht mit Diagrammen ; gleiche Sichtbarkeitsregeln wie `ergebnisse`.
        `?lang=de|fr` (Standard: bevorzugte Sprache des Nutzers, sonst Deutsch)."""
        umfrage = self.get_object()
        daten = self._ergebnis_daten(umfrage, request.user)
        sprache = request.query_params.get("lang") or getattr(request.user, "langue_preferee", "")
        pdf = erzeuge_bericht_pdf(umfrage=umfrage, daten=daten, sprache=sprache)
        antwort = HttpResponse(pdf, content_type="application/pdf")
        dateiname = slugify(umfrage.titel)[:60] or "umfrage"
        antwort["Content-Disposition"] = f'attachment; filename="bericht_{dateiname}.pdf"'
        return antwort

    def _ergebnis_daten(self, umfrage, user) -> dict:
        teilgenommen = umfrage.teilnahmen.filter(user=user).exists()
        if not kann_ergebnisse_sehen(user, umfrage, teilgenommen):
            raise PermissionDenied("Die Ergebnisse sind für dich (noch) nicht freigegeben.")
        verwaltung = ist_verwaltung(user)

        antworten = list(
            UmfrageAntwort.objects.filter(einreichung__umfrage=umfrage).select_related(
                "einreichung__user", "option"
            )
        )
        gesamt = umfrage.einreichungen.count()
        uebersetzungen = uebersetzungen_fuer_umfrage(umfrage)
        fragen = []
        for frage in umfrage.fragen.all():
            zeilen = [a for a in antworten if a.frage_id == frage.id]
            eintrag = {
                "id": str(frage.id),
                "text": frage.text,
                "thema": frage.thema,
                "typ": frage.typ,
                "uebersetzungen": uebersetzungen.get(str(frage.id), {}),
            }
            if frage.typ == FrageTyp.FREITEXT:
                eintrag["freitexte"] = [a.freitext for a in zeilen]
            else:
                mit_option = [a for a in zeilen if a.option_id]
                beantwortet = len({a.einreichung_id for a in mit_option})
                eintrag["beantwortet"] = beantwortet
                if frage.freitext_zusatz:
                    eintrag["freitexte"] = [a.freitext for a in zeilen if not a.option_id]
                eintrag["optionen"] = [
                    {
                        "id": str(o.id),
                        "text": o.text,
                        "uebersetzungen": uebersetzungen.get(str(o.id), {}),
                        "anzahl": (n := sum(1 for a in mit_option if a.option_id == o.id)),
                        "anteil": round(100 * n / beantwortet) if beantwortet else 0,
                    }
                    for o in frage.optionen.all()
                ]
            fragen.append(eintrag)
        daten = {
            "teilnehmende": gesamt,
            "anonym": umfrage.anonym,
            "fragen": fragen,
        }
        if verwaltung and not umfrage.anonym:
            daten["einreichungen"] = self._einreichungen(umfrage, antworten)
        return daten

    @staticmethod
    def _einreichungen(umfrage, antworten):
        """Namentliche Umfrage, nur Verwaltung: wer hat was geantwortet."""
        fragen = {f.id: f.text for f in umfrage.fragen.all()}
        liste = []
        for einreichung in umfrage.einreichungen.select_related("user__membre"):
            werte = {}
            for a in antworten:
                if a.einreichung_id == einreichung.id:
                    werte.setdefault(a.frage_id, []).append(a.freitext or a.option.text)
            user = einreichung.user
            membre = getattr(user, "membre", None) if user else None
            name = f"{membre.prenom} {membre.nom}" if membre else (user.email if user else "")
            liste.append(
                {
                    "name": name,
                    "email": user.email if user else "",
                    "datum": einreichung.created_at,
                    "antworten": [
                        {"frage": fragen[fid], "werte": w}
                        for fid, w in werte.items()
                        if fid in fragen
                    ],
                }
            )
        return liste

    # --- Verwaltung --------------------------------------------------------------------
    @action(detail=True, methods=["post"])
    def veroeffentlichen(self, request, pk=None):
        umfrage = self.get_object()
        if not umfrage.fragen.exists():
            raise ValidationError("Die Umfrage hat noch keine Fragen.")
        if umfrage.abgelaufen:
            raise ValidationError("Die Frist liegt in der Vergangenheit – bitte zuerst anpassen.")
        umfrage.veroeffentlicht = True
        umfrage.save(update_fields=["veroeffentlicht", "updated_at"])
        return Response(self.get_serializer(umfrage).data)

    @action(detail=True, methods=["post"])
    def zurueckziehen(self, request, pk=None):
        umfrage = self.get_object()
        umfrage.veroeffentlicht = False
        umfrage.save(update_fields=["veroeffentlicht", "updated_at"])
        return Response(self.get_serializer(umfrage).data)

    @action(detail=True, methods=["post"])
    def ankuendigen(self, request, pk=None):
        umfrage = self.get_object()
        if not umfrage.veroeffentlicht:
            raise ValidationError("Nur veröffentlichte Umfragen können angekündigt werden.")
        if umfrage.publikation_id:
            raise ValidationError("Diese Umfrage wurde bereits in den Neuigkeiten angekündigt.")
        membre = getattr(request.user, "membre", None)
        if membre is None:
            raise ValidationError("Dein Konto hat keine Mitgliedsakte – Ankündigung nicht möglich.")
        link = f"{settings.FRONTEND_URL.rstrip('/')}/umfragen/{umfrage.id}"
        beschreibung = escape(umfrage.beschreibung[:300])
        html = (
            f"<p><strong>Neue Umfrage: {escape(umfrage.titel)}</strong></p>"
            + (f"<p>{beschreibung}</p>" if beschreibung else "")
            + f'<p><a href="{escape(link)}">Jetzt teilnehmen</a> '
            f"(bis {umfrage.frist.astimezone().strftime('%d.%m.%Y')})</p>"
        )
        publikation = Publication.objects.create(auteur=membre, contenu=html, important=True)
        umfrage.publikation = publikation
        umfrage.save(update_fields=["publikation", "updated_at"])
        notifier_publication_importante.delay(str(publikation.id))
        return Response(self.get_serializer(umfrage).data)

    @action(detail=True, methods=["post", "delete"])
    @parser_classes([MultiPartParser])
    def bild(self, request, pk=None):
        umfrage = self.get_object()
        if request.method == "DELETE":
            umfrage.bild.delete(save=False)
            umfrage.bild = None
        else:
            eingabe = BildSerializer(data=request.data)
            eingabe.is_valid(raise_exception=True)
            umfrage.bild = eingabe.validated_data["bild"]
        umfrage.save()
        return Response(self.get_serializer(umfrage).data)

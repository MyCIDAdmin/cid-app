"""Regionen-Berichte (Release 31) — Fans und Aktivitäten.

„Fan“ ist jedes Konto — Mitglied oder nicht —, das sich für mindestens ein veröffentlichtes oder
abgeschlossenes regionales Treffen angemeldet hat. Abgesagte Treffen und Entwürfe zählen nicht.

  GET  <slug>/fans/                 Fans der Region (Verantwortliche der Region, Büro): Name, Art,
                                    Anmeldungen, Teilnahmen, Reaktionen, letzte Aktivität
  GET  <slug>/fans/<user_id>/       Aktivitäten einer Person in dieser Region
  GET  berichte/?von&bis&region     Kennzahlen je Region und gesamt (Büro, mindestens lesend)
  GET  berichte/export/?von&bis     dasselbe als CSV (Excel, Semikolon)

Verantwortliche sehen nur Namen und Zahlen, keine E-Mail-Adressen und keine Kontaktdaten.
"""

import csv
import datetime
import uuid

from django.db.models import Count, Max, Min, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.membres.models import StatutMembre

from . import services
from .models import (
    Beitrag,
    FanProfil,
    PunkteEintrag,
    Reaktion,
    Region,
    Teilnahme,
    Veranstaltung,
    VeranstaltungStatus,
)
from .permissions import IsAuthenticated
from .views import _region

S = VeranstaltungStatus
ZAEHLEND = (S.VEROEFFENTLICHT, S.ABGESCHLOSSEN)
SEITE_STANDARD = 25


def _teilnahmen(region: Region | None = None):
    qs = Teilnahme.objects.filter(veranstaltung__status__in=ZAEHLEND)
    return qs.filter(veranstaltung__region=region) if region else qs


# ---------------------------------------------------------------------------------------------
# Fans einer Region (Verantwortliche)
# ---------------------------------------------------------------------------------------------


def _zugriff(request, region: Region):
    if not services.darf_bearbeiten(request.user, region):
        raise PermissionDenied()


def _ganzzahl(wert, standard: int, minimum: int, maximum: int, feld: str) -> int:
    if wert in (None, ""):
        return standard
    try:
        return max(minimum, min(int(wert), maximum))
    except ValueError:
        raise ValidationError({feld: "Zahl erwartet."})


def fans_der_region(region: Region) -> list[dict]:
    zeilen = {
        z["user_id"]: z
        for z in _teilnahmen(region)
        .values("user_id")
        .annotate(
            anmeldungen=Count("id"),
            teilnahmen=Count("id", filter=Q(anwesend=True, veranstaltung__status=S.ABGESCHLOSSEN)),
            letzte=Max("created_at"),
        )
    }
    reaktionen = {
        z["user_id"]: z
        for z in Reaktion.objects.filter(beitrag__region=region, user_id__in=list(zeilen))
        .values("user_id")
        .annotate(n=Count("id"), letzte=Max("created_at"))
    }
    nutzer = User.objects.filter(pk__in=list(zeilen)).select_related("membre", "fan_profil")
    erg = []
    for u in nutzer:
        z, r = zeilen[u.pk], reaktionen.get(u.pk)
        letzte = max(z["letzte"], r["letzte"]) if r else z["letzte"]
        erg.append(
            {
                "user": str(u.pk),
                "name": services.anzeigename_von(u),
                "art": "mitglied" if hasattr(u, "membre") else "fan",
                "anmeldungen": z["anmeldungen"],
                "teilnahmen": z["teilnahmen"],
                "reaktionen": r["n"] if r else 0,
                "letzte_aktivitaet": letzte,
            }
        )
    erg.sort(key=lambda e: e["letzte_aktivitaet"], reverse=True)
    return erg


class FansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        region = _region(slug)
        _zugriff(request, region)
        liste = fans_der_region(region)
        q = request.query_params.get("q", "").strip().lower()
        art = request.query_params.get("art", "")
        if q:
            liste = [e for e in liste if q in e["name"].lower()]
        if art in ("mitglied", "fan"):
            liste = [e for e in liste if e["art"] == art]
        zahlen = {
            "gesamt": len(liste),
            "mitglieder": sum(1 for e in liste if e["art"] == "mitglied"),
            "fans": sum(1 for e in liste if e["art"] == "fan"),
        }
        limit = _ganzzahl(request.query_params.get("limit"), SEITE_STANDARD, 1, 200, "limit")
        offset = _ganzzahl(request.query_params.get("offset"), 0, 0, 100000, "offset")
        return Response({**zahlen, "ergebnisse": liste[offset : offset + limit]})


class FanDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug, user_id: uuid.UUID):
        region = _region(slug)
        _zugriff(request, region)
        nutzer = get_object_or_404(User.objects.select_related("membre", "fan_profil"), pk=user_id)
        teilnahmen = (
            _teilnahmen(region)
            .filter(user=nutzer)
            .select_related("veranstaltung")
            .order_by("-veranstaltung__datum")
        )
        reaktionen = Reaktion.objects.filter(beitrag__region=region, user=nutzer).count()
        if not teilnahmen and not reaktionen:
            return Response(status=404)
        return Response(
            {
                "name": services.anzeigename_von(nutzer),
                "art": "mitglied" if hasattr(nutzer, "membre") else "fan",
                "reaktionen": reaktionen,
                "veranstaltungen": [
                    {
                        "id": str(t.veranstaltung_id),
                        "titel": t.veranstaltung.titel,
                        "datum": t.veranstaltung.datum.isoformat(),
                        "angemeldet_am": t.created_at,
                        "anwesend": t.anwesend,
                        "abgeschlossen": t.veranstaltung.status == S.ABGESCHLOSSEN,
                    }
                    for t in teilnahmen
                ],
            }
        )


# ---------------------------------------------------------------------------------------------
# Berichte (Büro)
# ---------------------------------------------------------------------------------------------


def kennzahlen(von: datetime.date, bis: datetime.date, region: Region | None = None) -> dict:
    """Zahlen für den Zeitraum ; `region=None` = alle Regionen zusammen (Personen nur einmal)."""
    zeitraum = {"veranstaltung__datum__range": (von, bis)}
    veranstaltungen = Veranstaltung.objects.filter(datum__range=(von, bis))
    beitraege = Beitrag.objects.filter(created_at__date__range=(von, bis))
    reaktionen = Reaktion.objects.filter(created_at__date__range=(von, bis))
    punkte = PunkteEintrag.objects.filter(datum__range=(von, bis))
    fans_land = FanProfil.objects.filter(
        mitgliedsantrag_am__date__range=(von, bis), user__membre__statut=StatutMembre.ACTIF
    )
    if region:
        veranstaltungen = veranstaltungen.filter(region=region)
        beitraege = beitraege.filter(region=region)
        reaktionen = reaktionen.filter(beitrag__region=region)
        punkte = punkte.filter(region=region)
        laender = list(region.laender.values_list("land", flat=True))
        fans_land = fans_land.filter(land_de__in=laender)
    im_zeitraum = _teilnahmen(region).filter(**zeitraum)
    abgeschlossen = im_zeitraum.filter(veranstaltung__status=S.ABGESCHLOSSEN)
    bis_heute = _teilnahmen(region).filter(veranstaltung__datum__lte=bis)
    fans_ids = set(bis_heute.values_list("user_id", flat=True).distinct())
    mitglieder = set(
        User.objects.filter(pk__in=fans_ids, membre__isnull=False).values_list("pk", flat=True)
    )
    erste = (
        bis_heute.values("user_id")
        .annotate(erste=Min("veranstaltung__datum"))
        .filter(erste__gte=von)
        .count()
    )
    aktiv = set(im_zeitraum.values_list("user_id", flat=True)) | set(
        reaktionen.values_list("user_id", flat=True)
    )
    angemeldet = abgeschlossen.count()
    anwesend = abgeschlossen.filter(anwesend=True).count()
    return {
        "treffen": veranstaltungen.filter(status=S.ABGESCHLOSSEN).count(),
        "geplant": veranstaltungen.filter(status=S.VEROEFFENTLICHT).count(),
        "abgesagt": veranstaltungen.filter(status=S.ABGESAGT).count(),
        "anmeldungen": im_zeitraum.count(),
        "anwesende": anwesend,
        "anwesenheitsquote": round(100 * anwesend / angemeldet) if angemeldet else None,
        "beitraege": beitraege.count(),
        "reaktionen": reaktionen.count(),
        "fans_gesamt": len(fans_ids),
        "fans_mitglieder": len(mitglieder),
        "fans_ohne_mitgliedschaft": len(fans_ids) - len(mitglieder),
        "fans_neu": erste,
        "fans_aktiv": len(aktiv),
        "fan_zu_mitglied": fans_land.count(),
        "punkte": punkte.aggregate(s=Sum("punkte"))["s"] or 0,
    }


def bericht(von: datetime.date, bis: datetime.date) -> dict:
    regionen = Region.objects.filter(aktiv=True).order_by("reihenfolge", "name")
    return {
        "von": von.isoformat(),
        "bis": bis.isoformat(),
        "regionen": [{"slug": r.slug, "name": r.name, **kennzahlen(von, bis, r)} for r in regionen],
        "gesamt": kennzahlen(von, bis),
    }


def _zeitraum(request) -> tuple[datetime.date, datetime.date]:
    heute = datetime.date.today()

    def datum(feld, standard):
        wert = request.query_params.get(feld)
        if not wert:
            return standard
        try:
            return datetime.date.fromisoformat(wert)
        except ValueError:
            raise ValidationError({feld: "Datum im Format JJJJ-MM-TT erwartet."})

    von = datum("von", heute.replace(month=1, day=1))
    bis = datum("bis", heute)
    if bis < von:
        raise ValidationError({"bis": "Das Ende liegt vor dem Beginn."})
    if (bis - von).days > 1100:
        raise ValidationError({"bis": "Höchstens drei Jahre auf einmal."})
    return von, bis


def _berichtsrecht(request):
    if not services.darf_berichte(request.user):
        raise PermissionDenied()


class BerichtView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _berichtsrecht(request)
        von, bis = _zeitraum(request)
        return Response(bericht(von, bis))


SPALTEN = [
    ("Region", None),
    ("Treffen abgeschlossen", "treffen"),
    ("Treffen geplant", "geplant"),
    ("Treffen abgesagt", "abgesagt"),
    ("Anmeldungen", "anmeldungen"),
    ("Anwesende", "anwesende"),
    ("Anwesenheitsquote %", "anwesenheitsquote"),
    ("Beiträge", "beitraege"),
    ("Reaktionen", "reaktionen"),
    ("Fans gesamt", "fans_gesamt"),
    ("davon Mitglieder", "fans_mitglieder"),
    ("davon ohne Mitgliedschaft", "fans_ohne_mitgliedschaft"),
    ("Neue Fans", "fans_neu"),
    ("Aktive Fans", "fans_aktiv"),
    ("Fan wird Mitglied", "fan_zu_mitglied"),
    ("Wettbewerbspunkte", "punkte"),
]


class BerichtExportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _berichtsrecht(request)
        von, bis = _zeitraum(request)
        daten = bericht(von, bis)
        antwort = HttpResponse(content_type="text/csv; charset=utf-8")
        antwort["Content-Disposition"] = f'attachment; filename="regionen-bericht-{von}-{bis}.csv"'
        antwort.write("﻿")  # Excel erkennt so UTF-8
        schreiber = csv.writer(antwort, delimiter=";")
        schreiber.writerow([f"Regionen-Bericht {von} bis {bis}"])
        schreiber.writerow([name for name, _ in SPALTEN])
        for zeile in [*daten["regionen"], {"name": "Gesamt", **daten["gesamt"]}]:
            schreiber.writerow(
                [
                    zeile["name"] if k is None else ("" if zeile[k] is None else zeile[k])
                    for _, k in SPALTEN
                ]
            )
        return antwort

"""Regionen-Wettbewerb (Release 30) — API unter /api/v1/regionen/wettbewerb/.

  GET   wettbewerb/                      Rangliste, Verlauf, Monatssieger, Regeln (alle Konten)
                                         (?saison=<id> für eine frühere Saison)
  GET   wettbewerb/journal/              Punkte-Journal (Büro) (?saison&region&limit&offset)
  POST  wettbewerb/korrekturen/          Korrekturbuchung mit Begründung (Büro)
  GET|POST wettbewerb/saisons/           Saisons anzeigen / anlegen (App Admin)
  PATCH|DELETE wettbewerb/saisons/<id>/  ändern / löschen (nur ohne Einträge)
  POST  wettbewerb/saisons/<id>/einfrieren/   Rangliste einfrieren (nach Saisonende)
  POST  wettbewerb/saisons/<id>/nachbuchen/   abgeschlossene Treffen nachbuchen
  GET|PUT wettbewerb/regeln/             Punkte-Regeln (App Admin ändert)
"""

import datetime

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services, wettbewerb
from .models import PunkteEintrag, PunkteGrund, Region, Saison, WettbewerbEinstellung
from .permissions import IsAuthenticated, IsSuperAdmin
from .views import _text, _uuid

REGEL_FELDER = {
    "punkte_veranstaltung": (0, 1000),
    "punkte_anwesend": (0, 100),
    "max_anwesende": (0, 500),
    "punkte_erstteilnehmer": (0, 100),
    "punkte_neumitglied": (0, 1000),
    "max_treffen_monat": (1, 100),
}


def regeln_dict(r: WettbewerbEinstellung) -> dict:
    return {feld: getattr(r, feld) for feld in REGEL_FELDER}


def saison_dict(s: Saison) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "start": s.start.isoformat(),
        "ende": s.ende.isoformat(),
        "preis": s.preis,
        "eingefroren": s.eingefroren_am is not None,
        "laufend": s.start <= wettbewerb.heute() <= s.ende,
    }


def _verwalter(request):
    if not services.ist_personenverwalter(request.user):
        raise PermissionDenied()


def _datum(daten, feld) -> datetime.date:
    try:
        return datetime.date.fromisoformat(str(daten.get(feld, "")))
    except ValueError:
        raise ValidationError({feld: "Datum im Format JJJJ-MM-TT erwartet."})


class WettbewerbView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        saisons = list(Saison.objects.all())
        wahl = request.query_params.get("saison")
        if wahl:
            saison = get_object_or_404(Saison, pk=_uuid(wahl, "saison"))
        else:
            saison = wettbewerb.anzuzeigende_saison()
        antwort = {
            "saisons": [saison_dict(s) for s in saisons],
            "saison": saison_dict(saison) if saison else None,
            "regeln": regeln_dict(WettbewerbEinstellung.holen()),
            "ewige_tabelle": wettbewerb.ewige_tabelle(),
            "darf_verwalten": services.ist_personenverwalter(request.user),
            "ist_admin": IsSuperAdmin().has_permission(request, self),
            "rangliste": [],
            "verlauf": {"monate": [], "serien": []},
            "monatssieger": [],
        }
        if saison:
            antwort.update(wettbewerb.tabelle(saison))
        return Response(antwort)


def eintrag_dict(e: PunkteEintrag) -> dict:
    von = e.erstellt_von
    return {
        "id": str(e.id),
        "saison": e.saison.name,
        "region": {"slug": e.region.slug, "name": e.region.name},
        "grund": e.grund,
        "punkte": e.punkte,
        "anzahl": e.anzahl,
        "veranstaltung": (
            {"id": str(e.veranstaltung_id), "titel": e.veranstaltung.titel}
            if e.veranstaltung_id
            else None
        ),
        "datum": e.datum.isoformat(),
        "begruendung": e.begruendung,
        "von": (services.anzeigename_von(von) or von.email) if von else "",
        "erstellt_am": e.created_at,
    }


class JournalView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _verwalter(request)
        eintraege = PunkteEintrag.objects.select_related(
            "saison", "region", "veranstaltung", "erstellt_von", "erstellt_von__membre"
        )
        if request.query_params.get("saison"):
            eintraege = eintraege.filter(saison_id=_uuid(request.query_params["saison"], "saison"))
        if request.query_params.get("region"):
            eintraege = eintraege.filter(region__slug=request.query_params["region"])
        try:
            limit = max(1, min(int(request.query_params.get("limit", 50)), 200))
            offset = max(0, int(request.query_params.get("offset", 0)))
        except ValueError:
            raise ValidationError({"limit": "Zahl erwartet."})
        gesamt = eintraege.count()
        seite = eintraege.order_by("-created_at")[offset : offset + limit]
        return Response({"gesamt": gesamt, "ergebnisse": [eintrag_dict(e) for e in seite]})


class KorrekturView(APIView):
    """Nur das Büro korrigiert ; jede Korrektur ist ein neuer Journal-Eintrag mit Begründung."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        _verwalter(request)
        daten = request.data
        region = get_object_or_404(Region, slug=str(daten.get("region", "")))
        punkte = daten.get("punkte")
        if isinstance(punkte, bool) or not isinstance(punkte, int) or punkte == 0:
            raise ValidationError({"punkte": "Ganze Zahl ungleich 0 erwartet."})
        if abs(punkte) > 1000:
            raise ValidationError({"punkte": "Höchstens 1000 Punkte je Korrektur."})
        begruendung = _text(daten, "begruendung", 300, pflicht=True)
        if daten.get("saison"):
            saison = get_object_or_404(Saison, pk=_uuid(daten["saison"], "saison"))
        else:
            saison = wettbewerb.saison_fuer(wettbewerb.heute())
        if saison is None:
            raise ValidationError({"saison": "Es läuft keine Saison."})
        if saison.eingefroren_am:
            raise ValidationError({"saison": "Die Saison ist eingefroren."})
        eintrag = PunkteEintrag.objects.create(
            saison=saison,
            region=region,
            grund=PunkteGrund.KORREKTUR,
            punkte=punkte,
            begruendung=begruendung,
            datum=wettbewerb.heute(),
            erstellt_von=request.user,
        )
        return Response(eintrag_dict(eintrag), status=201)


def _saison_felder(daten, vorhanden: Saison | None = None) -> dict:
    erg = {}
    if vorhanden is None or "name" in daten:
        erg["name"] = _text(daten, "name", 100, pflicht=True)
    if vorhanden is None or "start" in daten:
        erg["start"] = _datum(daten, "start")
    if vorhanden is None or "ende" in daten:
        erg["ende"] = _datum(daten, "ende")
    if "preis" in daten:
        erg["preis"] = _text(daten, "preis", 500)
    start = erg.get("start", vorhanden.start if vorhanden else None)
    ende = erg.get("ende", vorhanden.ende if vorhanden else None)
    if ende < start:
        raise ValidationError({"ende": "Das Ende liegt vor dem Start."})
    andere = Saison.objects.exclude(pk=vorhanden.pk if vorhanden else None)
    if andere.filter(start__lte=ende, ende__gte=start).exists():
        raise ValidationError(
            {"start": "Der Zeitraum überschneidet sich mit einer anderen Saison."}
        )
    name = erg.get("name")
    if name and andere.filter(name__iexact=name).exists():
        raise ValidationError({"name": "Diesen Namen gibt es schon."})
    return erg


class SaisonListeView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        return Response([saison_dict(s) for s in Saison.objects.all()])

    def post(self, request):
        saison = Saison.objects.create(**_saison_felder(request.data))
        return Response(saison_dict(saison), status=201)


class SaisonDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def patch(self, request, pk):
        saison = get_object_or_404(Saison, pk=pk)
        if saison.eingefroren_am:
            raise ValidationError({"detail": "Eine eingefrorene Saison bleibt unverändert."})
        for feld, wert in _saison_felder(request.data, saison).items():
            setattr(saison, feld, wert)
        saison.save()
        return Response(saison_dict(saison))

    def delete(self, request, pk):
        saison = get_object_or_404(Saison, pk=pk)
        if saison.eintraege.exists() or saison.eingefroren_am:
            raise ValidationError(
                {"detail": "Die Saison hat Punkte oder ist eingefroren und bleibt erhalten."}
            )
        saison.delete()
        return Response(status=204)


class SaisonEinfrierenView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        with transaction.atomic():
            saison = Saison.objects.select_for_update().get(pk=get_object_or_404(Saison, pk=pk).pk)
            if saison.eingefroren_am:
                raise ValidationError({"detail": "Die Saison ist bereits eingefroren."})
            if saison.ende >= wettbewerb.heute():
                raise ValidationError({"detail": "Die Saison ist noch nicht zu Ende."})
            wettbewerb.einfrieren(saison)
        return Response(saison_dict(saison))


class SaisonNachbuchenView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        saison = get_object_or_404(Saison, pk=pk)
        if saison.eingefroren_am:
            raise ValidationError({"detail": "Die Saison ist eingefroren."})
        with transaction.atomic():
            neu = wettbewerb.nachbuchen(saison)
        return Response({"gebucht": neu})


class RegelnView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(regeln_dict(WettbewerbEinstellung.holen()))

    def put(self, request):
        if not IsSuperAdmin().has_permission(request, self):
            raise PermissionDenied()
        regeln = WettbewerbEinstellung.holen()
        for feld, (minimum, maximum) in REGEL_FELDER.items():
            if feld not in request.data:
                continue
            wert = request.data[feld]
            if (
                isinstance(wert, bool)
                or not isinstance(wert, int)
                or not minimum <= wert <= maximum
            ):
                raise ValidationError({feld: f"Ganze Zahl von {minimum} bis {maximum} erwartet."})
            setattr(regeln, feld, wert)
        regeln.save()
        return Response(regeln_dict(regeln))

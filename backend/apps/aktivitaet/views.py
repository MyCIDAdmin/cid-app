"""Aktivität (Release 20) : Übersicht, Journal und CSV-Export des Protokolls — nur App-Admin.

  GET /aktivitaet/uebersicht/?tage=7|30|90   Kacheln, Verlauf, Heatmap, Konten
  GET /aktivitaet/journal/?von&bis&aktion&kategorie&gewicht&user&ip&q&seite
  GET /aktivitaet/journal/export/            dasselbe als CSV (max. 20 000 Zeilen)
  GET /aktivitaet/nutzung/?tage=7|30|90      Nutzungsstatistik je Modul (R23)
  GET /aktivitaet/aktionen/                  Aktionen und Kategorien für die Filter
  GET /aktivitaet/auffaelligkeiten/?status=offen|erledigt|alle   erkannte Auffälligkeiten (R22)
  POST /aktivitaet/auffaelligkeiten/<id>/erledigen/
  GET /aktivitaet/berichte/, berichte/<jahr>/<monat>/[erzeugen|senden]/   Monatsbericht (R24)
  GET/POST /aktivitaet/review/, review/<id>/[positionen/<id>/|abschliessen/]   Rechteprüfung (R24)
  GET/PUT /aktivitaet/pflege/                Datenpflege : Fristen, Vorschau, Schalter (R25)
  POST /aktivitaet/pflege/ausfuehren/        Datenpflege jetzt ausführen (bestaetigt=true)
"""

import csv
import json
from datetime import timedelta

from django.core.paginator import Paginator
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AuditLogEntry
from apps.accounts.permissions import IsSuperAdmin
from apps.accounts.services import log_audit_event

from . import bericht
from . import kategorien as kat
from . import nutzung, pflege, regeln, review
from .models import Auffaelligkeit, Monatsbericht, RechtePosition, RechteReview
from .services import ERLAUBTE_TAGE, eintrag_dict, journal_filtern, name_von, person_dict

PRO_SEITE = 50
EXPORT_MAX = 20000


def _ip(request) -> str | None:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    return (xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")) or None


def _zugriff_protokollieren(request, aktion="aktivitaet_geoeffnet", dedupe=True, **meta):
    """Wer das Protokoll öffnet oder exportiert, steht selbst im Protokoll (Öffnen höchstens
    einmal je 30 Minuten und Person)."""
    if (
        dedupe
        and AuditLogEntry.objects.filter(
            user=request.user,
            action=aktion,
            created_at__gte=timezone.now() - timedelta(minutes=30),
        ).exists()
    ):
        return
    log_audit_event(
        aktion,
        user=request.user,
        ip_address=_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
        **meta,
    )


class UebersichtView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        from .services import uebersicht

        try:
            tage = int(request.query_params.get("tage", 30))
        except ValueError:
            tage = 30
        tage = tage if tage in ERLAUBTE_TAGE else 30
        _zugriff_protokollieren(request)
        return Response(uebersicht(tage))


class JournalView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        _zugriff_protokollieren(request)
        qs = journal_filtern(request.query_params)
        try:
            seite = max(1, int(request.query_params.get("seite", 1)))
        except ValueError:
            seite = 1
        paginator = Paginator(qs, PRO_SEITE)
        page = paginator.get_page(seite)
        return Response(
            {
                "anzahl": paginator.count,
                "seite": page.number,
                "seiten": paginator.num_pages,
                "ergebnisse": [eintrag_dict(e) for e in page.object_list],
            }
        )


def _zelle(wert) -> str:
    """CSV-Injection verhindern : Zellen, die mit = + - @ beginnen, bekommen ein Hochkomma."""
    text = "" if wert is None else str(wert)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


class ExportView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        qs = journal_filtern(request.query_params)[:EXPORT_MAX]
        _zugriff_protokollieren(
            request,
            "aktivitaet_export",
            dedupe=False,
            filter={k: v for k, v in request.query_params.items() if v},
        )
        antwort = HttpResponse(content_type="text/csv; charset=utf-8")
        antwort["Content-Disposition"] = (
            f'attachment; filename="aktivitaet-{timezone.localdate():%Y%m%d}.csv"'
        )
        antwort.write("﻿")  # BOM : Excel erkennt UTF-8
        schreiber = csv.writer(antwort, delimiter=";")
        schreiber.writerow(
            ["Zeit", "Aktion", "Kategorie", "Person", "E-Mail", "IP", "Gerät", "Details"]
        )
        for e in qs:
            d = eintrag_dict(e)
            schreiber.writerow(
                [
                    _zelle(timezone.localtime(e.created_at).strftime("%Y-%m-%d %H:%M:%S")),
                    _zelle(d["label"]["de"]),
                    _zelle(kat.KATEGORIEN[d["kategorie"]][0]),
                    _zelle(name_von(e.user) if e.user_id else ""),
                    _zelle(e.user.email if e.user_id else ""),
                    _zelle(e.ip_address),
                    _zelle(e.user_agent),
                    _zelle(json.dumps(e.metadata, ensure_ascii=False) if e.metadata else ""),
                ]
            )
        return antwort


class AktionenView(APIView):
    """Auswahllisten für die Filter : Kategorien und alle bekannten sowie vorkommenden Aktionen."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        vorhanden = set(AuditLogEntry.objects.values_list("action", flat=True).distinct())
        aktionen = []
        for a in sorted(set(kat.AKTIONEN) | vorhanden):
            de, fr = kat.label_von(a)
            aktionen.append(
                {
                    "aktion": a,
                    "label": {"de": de, "fr": fr},
                    "kategorie": kat.kategorie_von(a),
                    "gewicht": kat.gewicht_von(a),
                }
            )
        return Response(
            {
                "kategorien": [
                    {
                        "key": k,
                        "label": {"de": v[0], "fr": v[1]},
                        "aufbewahrung_tage": pflege.journal_frist(k),
                    }
                    for k, v in kat.KATEGORIEN.items()
                ],
                "aktionen": aktionen,
            }
        )


def auffaelligkeit_dict(a: Auffaelligkeit) -> dict:
    return {
        "id": str(a.id),
        "regel": a.regel,
        "gewicht": a.gewicht,
        "erkannt_am": a.erkannt_am,
        "status": a.status,
        "text": regeln.text_von(a.regel, a.details),
        "user": person_dict(a.user),
        "ip": a.ip_address,
        "erledigt_von": person_dict(a.erledigt_von),
        "erledigt_am": a.erledigt_am,
    }


class AuffaelligkeitenView(APIView):
    """Liste der erkannten Auffälligkeiten (neueste zuerst, höchstens 200)."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        status = request.query_params.get("status", "offen")
        qs = Auffaelligkeit.objects.select_related("user", "erledigt_von")
        if status in (Auffaelligkeit.Status.OFFEN, Auffaelligkeit.Status.ERLEDIGT):
            qs = qs.filter(status=status)
        _zugriff_protokollieren(request)
        return Response(
            {
                "offen": Auffaelligkeit.objects.filter(status=Auffaelligkeit.Status.OFFEN).count(),
                "ergebnisse": [auffaelligkeit_dict(a) for a in qs[:200]],
            }
        )


class ErledigenView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        a = get_object_or_404(Auffaelligkeit, pk=pk)
        if a.status != Auffaelligkeit.Status.ERLEDIGT:
            a.status = Auffaelligkeit.Status.ERLEDIGT
            a.erledigt_von = request.user
            a.erledigt_am = timezone.now()
            a.save(update_fields=["status", "erledigt_von", "erledigt_am"])
            _zugriff_protokollieren(
                request, "auffaelligkeit_erledigt", dedupe=False, regel=a.regel, objekt_id=str(a.id)
            )
        return Response(auffaelligkeit_dict(a))


class NutzungView(APIView):
    """Nutzungsstatistik : aktive Personen pro Tag und Modul — nur Summen, nie einzelne Personen."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        try:
            tage = int(request.query_params.get("tage", 30))
        except ValueError:
            tage = 30
        tage = tage if tage in nutzung.ERLAUBTE_TAGE else 30
        _zugriff_protokollieren(request)
        return Response(nutzung.statistik(tage))


def bericht_dict(b: Monatsbericht, mit_daten=False) -> dict:
    d = {
        "jahr": b.jahr,
        "monat": b.monat,
        "erstellt_am": b.erstellt_am,
        "versendet_am": b.versendet_am,
    }
    if mit_daten:
        d["daten"] = b.daten
    return d


def _bericht(jahr: int, monat: int) -> Monatsbericht:
    b = Monatsbericht.objects.filter(jahr=jahr, monat=monat).first()
    if b is None:
        raise NotFound("Kein Bericht für diesen Monat.")
    return b


class BerichteView(APIView):
    """Liste der vorhandenen Monatsberichte und der Monate, die sich erzeugen lassen."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        _zugriff_protokollieren(request)
        letzter = bericht.vormonat()
        return Response(
            {
                "letzter_abgeschlossener_monat": {"jahr": letzter[0], "monat": letzter[1]},
                "ergebnisse": [bericht_dict(b) for b in Monatsbericht.objects.all()[:36]],
            }
        )


class BerichtDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request, jahr, monat):
        _zugriff_protokollieren(request)
        return Response(bericht_dict(_bericht(jahr, monat), mit_daten=True))


class BerichtErzeugenView(APIView):
    """Bericht eines abgeschlossenen Monats (neu) berechnen — wiederholbar."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, jahr, monat):
        if not 1 <= monat <= 12 or (jahr, monat) > bericht.vormonat() or jahr < 2020:
            raise ValidationError("Nur abgeschlossene Monate können berichtet werden.")
        b = bericht.erstellen(jahr, monat)
        _zugriff_protokollieren(
            request, "monatsbericht_erstellt", dedupe=False, jahr=jahr, monat=monat
        )
        return Response(bericht_dict(b, mit_daten=True))


class BerichtSendenView(APIView):
    """Bericht an die eigene Adresse senden (der reguläre Versand an alle läuft automatisch)."""

    permission_classes = [IsSuperAdmin]

    def post(self, request, jahr, monat):
        b = _bericht(jahr, monat)
        bericht.senden(b, empfaenger=[request.user])
        _zugriff_protokollieren(
            request, "monatsbericht_gesendet", dedupe=False, jahr=jahr, monat=monat, empfaenger=1
        )
        return Response(bericht_dict(b))


def _review(pk) -> RechteReview:
    return get_object_or_404(RechteReview, pk=pk)


class ReviewListeView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request):
        _zugriff_protokollieren(request)
        return Response(
            {
                "aktuelles_quartal": review.quartal_von(),
                "ergebnisse": [review.review_dict(r) for r in RechteReview.objects.all()[:12]],
            }
        )

    def post(self, request):
        """Prüfung des laufenden Quartals anlegen (falls noch nicht vorhanden)."""
        r, neu = review.anlegen()
        if neu:
            _zugriff_protokollieren(
                request,
                "rechte_review_angelegt",
                dedupe=False,
                quartal=r.quartal,
                konten=r.positionen.count(),
            )
        return Response(review.review_dict(r), status=201 if neu else 200)


class ReviewDetailView(APIView):
    permission_classes = [IsSuperAdmin]

    def get(self, request, pk):
        _zugriff_protokollieren(request)
        return Response(review.review_dict(_review(pk), mit_positionen=True))


class EntscheidenView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk, position):
        r = _review(pk)
        if r.status != RechteReview.Status.OFFEN:
            raise ValidationError("Die Prüfung ist bereits abgeschlossen.")
        p = get_object_or_404(RechtePosition, pk=position, review=r)
        entscheidung = request.data.get("entscheidung")
        if entscheidung not in RechtePosition.Entscheidung.values:
            raise ValidationError("Ungültige Entscheidung.")
        p.entscheidung = entscheidung
        p.notiz = str(request.data.get("notiz", ""))[:200]
        offen = entscheidung == RechtePosition.Entscheidung.OFFEN
        p.entschieden_von = None if offen else request.user
        p.entschieden_am = None if offen else timezone.now()
        p.save(update_fields=["entscheidung", "notiz", "entschieden_von", "entschieden_am"])
        _zugriff_protokollieren(
            request,
            "rechte_review_entschieden",
            dedupe=False,
            quartal=r.quartal,
            entscheidung=entscheidung,
            objekt_id=str(p.id),
        )
        return Response(review.position_dict(p))


class AbschliessenView(APIView):
    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        r = _review(pk)
        if r.status == RechteReview.Status.ABGESCHLOSSEN:
            return Response(review.review_dict(r, mit_positionen=True))
        daten = review.review_dict(r, mit_positionen=True)
        if daten["offen"]:
            raise ValidationError("Es sind noch Konten ohne Entscheidung offen.")
        noch_aktiv = sum(
            p["entscheidung"] == RechtePosition.Entscheidung.ENTZIEHEN and p["aktuell_erweitert"]
            for p in daten["positionen"]
        )
        r.status = RechteReview.Status.ABGESCHLOSSEN
        r.abgeschlossen_von = request.user
        r.abgeschlossen_am = timezone.now()
        r.save(update_fields=["status", "abgeschlossen_von", "abgeschlossen_am"])
        _zugriff_protokollieren(
            request,
            "rechte_review_abgeschlossen",
            dedupe=False,
            quartal=r.quartal,
            konten=daten["anzahl"],
            entziehen=daten["entziehen"],
            entzug_noch_offen=noch_aktiv,
        )
        return Response(review.review_dict(r, mit_positionen=True))


# --- Datenpflege (Release 25) ----------------------------------------------------------------


def _pflege_antwort() -> dict:
    einst = pflege.einstellung()
    return {
        "automatisch": einst.automatisch,
        "letzter_lauf": (
            {
                "zeit": einst.letzter_lauf_am,
                "modus": einst.letzter_lauf_modus,
                "von": name_von(einst.letzter_lauf_von) if einst.letzter_lauf_von_id else None,
                "ergebnis": einst.letzter_lauf_ergebnis,
            }
            if einst.letzter_lauf_am
            else None
        ),
        "arten": pflege.vorschau(),
    }


def _fristen_pruefen(roh) -> dict:
    """Prüft `{Datenart: Tage | null}` ; `null` stellt den Standard wieder her."""
    if not isinstance(roh, dict):
        raise ValidationError({"fristen": "Erwartet wird ein Objekt."})
    neu = {}
    for key, wert in roh.items():
        art = pflege.ARTEN.get(key)
        if art is None or art.fest:
            raise ValidationError({"fristen": f"Unbekannte oder feste Datenart: {key}"})
        if wert is None:
            neu[key] = None
            continue
        if isinstance(wert, bool) or not isinstance(wert, int):
            raise ValidationError({"fristen": f"{key}: ganze Zahl erwartet."})
        if not art.minimum <= wert <= pflege.MAXIMUM_TAGE:
            raise ValidationError(
                {"fristen": f"{key}: zwischen {art.minimum} und {pflege.MAXIMUM_TAGE} Tagen."}
            )
        neu[key] = wert
    return neu


class PflegeView(APIView):
    """Datenpflege : Vorschau (was würde gelöscht ?), Fristen und Schalter „automatisch“."""

    permission_classes = [IsSuperAdmin]

    def get(self, request):
        return Response(_pflege_antwort())

    def put(self, request):
        einst = pflege.einstellung()
        geaendert = {}
        if "automatisch" in request.data:
            if not isinstance(request.data["automatisch"], bool):
                raise ValidationError({"automatisch": "true oder false erwartet."})
            if request.data["automatisch"] != einst.automatisch:
                geaendert["automatisch"] = request.data["automatisch"]
                einst.automatisch = request.data["automatisch"]
        if "fristen" in request.data:
            fristen = dict(einst.fristen)
            for key, wert in _fristen_pruefen(request.data["fristen"]).items():
                art = pflege.ARTEN[key]
                if wert is None or wert == art.standard:
                    if fristen.pop(key, None) is not None:
                        geaendert[key] = art.standard
                elif fristen.get(key) != wert:
                    fristen[key] = wert
                    geaendert[key] = wert
            einst.fristen = fristen
        if geaendert:
            einst.save(update_fields=["automatisch", "fristen"])
            log_audit_event(
                "datenpflege_geaendert",
                user=request.user,
                ip_address=_ip(request),
                user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
                aenderungen=geaendert,
            )
        return Response(_pflege_antwort())


class PflegeAusfuehrenView(APIView):
    """Datenpflege jetzt ausführen — nur nach ausdrücklicher Bestätigung."""

    permission_classes = [IsSuperAdmin]

    def post(self, request):
        if request.data.get("bestaetigt") is not True:
            raise ValidationError({"bestaetigt": "Die Bestätigung fehlt."})
        auswahl = request.data.get("arten")
        if auswahl is not None:
            if not isinstance(auswahl, list) or not auswahl:
                raise ValidationError({"arten": "Liste von Datenarten erwartet."})
            unbekannt = [a for a in auswahl if a not in pflege.ARTEN]
            if unbekannt:
                raise ValidationError({"arten": f"Unbekannte Datenart: {unbekannt[0]}"})
        ergebnis = pflege.lauf("manuell", user=request.user, schluessel=auswahl)
        log_audit_event(
            "datenpflege_manuell",
            user=request.user,
            ip_address=_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:255],
            summe=pflege.summe(ergebnis),
            arten={k: v for k, v in ergebnis.items() if v},
        )
        antwort = _pflege_antwort()
        antwort["ergebnis"] = ergebnis
        antwort["summe"] = pflege.summe(ergebnis)
        return Response(antwort)

"""Aktivität (Release 20) : Übersicht, Journal und CSV-Export des Protokolls — nur App-Admin.

  GET /aktivitaet/uebersicht/?tage=7|30|90   Kacheln, Verlauf, Heatmap, Konten
  GET /aktivitaet/journal/?von&bis&aktion&kategorie&gewicht&user&ip&q&seite
  GET /aktivitaet/journal/export/            dasselbe als CSV (max. 20 000 Zeilen)
  GET /aktivitaet/aktionen/                  Aktionen und Kategorien für die Filter
"""

import csv
import json
from datetime import timedelta

from django.core.paginator import Paginator
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import AuditLogEntry
from apps.accounts.permissions import IsSuperAdmin
from apps.accounts.services import log_audit_event

from . import kategorien as kat
from .services import ERLAUBTE_TAGE, eintrag_dict, journal_filtern, name_von

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
                    {"key": k, "label": {"de": v[0], "fr": v[1]}, "aufbewahrung_tage": v[2]}
                    for k, v in kat.KATEGORIEN.items()
                ],
                "aktionen": aktionen,
            }
        )

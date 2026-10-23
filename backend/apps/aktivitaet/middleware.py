"""Erfasst Datenänderungen und Exporte/Importe zentral im Protokoll (Release 21).

Statt jeden ViewSet einzeln zu ändern, schreibt diese Middleware nach jeder erfolgreichen
Anfrage unter /api/v1/ einen Eintrag — nur Methode, Pfad-Schablone (IDs → `{id}`), Objekt-ID und
Statuscode, **nie** Anfrageinhalte (keine personenbezogenen Daten im Journal). Neue Module sind
damit automatisch abgedeckt, sobald ihr URL-Präfix in `kategorien.MODULE` steht.

Fehler beim Protokollieren dürfen nie eine Anfrage scheitern lassen.
"""

import logging
import re

from django.core.cache import cache

from . import kategorien as kat
from . import nutzung

logger = logging.getLogger("apps.aktivitaet")

_PRAEFIX = "/api/v1/"
_ID = re.compile(
    r"^(\d+|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$"
)
_IMPORT = re.compile(r"^import(-historique|-ausgaben)?$")
# Persönliche Einstellungen, Stimmabgaben, Trockenläufe : nicht protokollieren
# (Wahlgeheimnis, Rauschen).
_IGNORIERT = {
    "ausblenden",
    "pruefen",
    "teilnehmen",
    "abstimmen",
    "voter",
    "stimme",
    "einlassen",
    "ruecknahme",
}
_SCHREIBEND = {"POST": "erstellt", "PUT": "geaendert", "PATCH": "geaendert", "DELETE": "geloescht"}


def _ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (xff.split(",")[0].strip() if xff else request.META.get("REMOTE_ADDR")) or None


def maskiere_pfad(pfad: str) -> str:
    return "/" + "/".join("{id}" if _ID.match(t) else t for t in pfad.split("/") if t)


def klassifizieren(methode: str, pfad: str, url_name: str = ""):
    """(Aktion, Pfad-Schablone, Objekt-ID) — oder None, wenn nichts zu protokollieren ist."""
    if not pfad.startswith(_PRAEFIX):
        return None
    teile = [t for t in pfad[len(_PRAEFIX) :].split("/") if t]
    if not teile or teile[0] not in kat.MODULE:
        return None
    praefix, rest = teile[0], teile[1:]
    objekt_id = next((t for t in rest if _ID.match(t)), "")
    schablone = "/".join(["{id}" if _ID.match(t) else t for t in rest])

    if _IGNORIERT.intersection(rest):
        return None
    if praefix == "notifications" and "parametres" not in rest:
        return None  # Lesen/Als-gelesen-Markieren ist kein Protokoll wert
    if methode == "GET":
        if any(t in ("export", "excel") or t.startswith("export-") for t in rest):
            return f"{praefix}_export", schablone, objekt_id
        return None
    if methode not in _SCHREIBEND:
        return None
    if methode == "POST" and any(_IMPORT.match(t) for t in rest):
        return f"{praefix}_import", schablone, objekt_id
    for teil, aktion in kat.SONDERFAELLE:
        if teil in schablone:
            return aktion, schablone, objekt_id

    if url_name.endswith("-list") and methode == "POST":
        verb = "erstellt"
    elif url_name.endswith("-detail") and methode != "POST":
        verb = _SCHREIBEND[methode]
    else:
        verb = "aktion"
    return f"{praefix}_{verb}", schablone, objekt_id


class AktivitaetMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._protokollieren(request, response)
        except Exception:  # pragma: no cover — Protokoll darf die Anfrage nie scheitern lassen
            logger.exception("Aktivitätsprotokoll fehlgeschlagen")
        return response

    def _protokollieren(self, request, response):
        if response.status_code >= 500:
            return self._serverfehler(request, response)
        if not 200 <= response.status_code < 300:
            return
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return
        self._nutzung(request, user)
        match = getattr(request, "resolver_match", None)
        ergebnis = klassifizieren(
            request.method, request.path, getattr(match, "url_name", "") or ""
        )
        if ergebnis is None:
            return
        aktion, schablone, objekt_id = ergebnis
        from apps.accounts.services import log_audit_event

        metadata = {"methode": request.method, "pfad": schablone, "status": response.status_code}
        if objekt_id:
            metadata["objekt_id"] = objekt_id
        log_audit_event(
            aktion,
            user=user,
            ip_address=_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            **metadata,
        )

    def _nutzung(self, request, user):
        """Nutzungsstatistik : ein Fenster je Person, Modul und 5 Minuten (nur Summen)."""
        modul = nutzung.modul_von(request.path)
        if modul is not None:
            nutzung.zaehlen(user, modul)

    def _serverfehler(self, request, response):
        """5xx unter /api/ : höchstens ein Eintrag je Methode und Pfad-Schablone pro Minute."""
        if not request.path.startswith("/api/"):
            return
        pfad = maskiere_pfad(request.path)
        if not cache.add(f"akt5xx:{request.method}:{pfad}", 1, 60):
            return
        user = getattr(request, "user", None)
        from apps.accounts.services import log_audit_event

        log_audit_event(
            "server_fehler",
            user=user if getattr(user, "is_authenticated", False) else None,
            ip_address=_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
            methode=request.method,
            pfad=pfad,
            status=response.status_code,
        )

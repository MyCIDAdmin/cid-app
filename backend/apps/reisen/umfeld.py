"""Karte „Am Reiseziel“ : Ortszeit, Wetter und Währungskurs, aus kostenlosen Quellen.

Grundsätze
- Abgerufen wird immer vom Server und kurz zwischengespeichert ; der Browser der Mitglieder
  spricht nie mit den Anbietern (keine IP-Adressen nach außen, kein Verstoß gegen die CSP).
- Gesendet wird nur der Zielort, nie etwas über Personen.
- Jede Quelle darf einzeln ausfallen : dann fehlt nur dieser Block, die Seite bleibt benutzbar.
- Open-Meteo (CC BY 4.0, nichtkommerziell) liefert Ortssuche und Wetter, open.er-api.com die
  Kurse (Namensnennung nötig). Die Kurse der EZB decken Tunesien, Ägypten und Algerien nicht ab.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import requests
from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

GEOCODING = "https://geocoding-api.open-meteo.com/v1/search"
WETTER = "https://api.open-meteo.com/v1/forecast"
KURSE = "https://open.er-api.com/v6/latest/EUR"
SICHERHEIT = "https://www.auswaertiges-amt.de/de/service/laender"
TIMEOUT = 4
VORHERSAGE_TAGE = 16  # so weit reicht die kostenlose Vorhersage
MAX_TAGE = 10

WETTER_TTL = 3 * 3600
KURS_TTL = 12 * 3600
FEHLER_TTL = 15 * 60

_EURO = ("AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES").split()  # Euro-Länder
WAEHRUNG_NACH_LAND = {
    **{c: "EUR" for c in _EURO},
    "TN": "TND", "EG": "EGP", "DZ": "DZD", "MA": "MAD", "LY": "LYD", "JO": "JOD",
    "QA": "QAR", "AE": "AED", "OM": "OMR", "SA": "SAR", "KW": "KWD", "BH": "BHD",
    "TR": "TRY", "GB": "GBP", "CH": "CHF", "US": "USD", "CA": "CAD", "PL": "PLN",
    "CZ": "CZK", "HU": "HUF", "RO": "RON", "BG": "BGN", "DK": "DKK", "SE": "SEK",
    "NO": "NOK", "RS": "RSD", "AL": "ALL", "BA": "BAM", "MK": "MKD", "ME": "EUR",
    "XK": "EUR", "UA": "UAH", "RU": "RUB", "IL": "ILS", "LB": "LBP", "IR": "IRR",
    "SN": "XOF", "CI": "XOF", "ML": "XOF", "CM": "XAF", "MR": "MRU", "ZA": "ZAR",
    "KE": "KES", "NG": "NGN", "GH": "GHS", "ET": "ETB", "TZ": "TZS", "AU": "AUD",
    "NZ": "NZD", "JP": "JPY", "CN": "CNY", "HK": "HKD", "IN": "INR", "TH": "THB",
    "ID": "IDR", "MY": "MYR", "SG": "SGD", "KR": "KRW", "BR": "BRL", "AR": "ARS",
    "MX": "MXN", "CL": "CLP", "CO": "COP", "PE": "PEN", "IS": "ISK",
}  # fmt: skip


def _get_json(url: str, params: dict) -> dict:
    antwort = requests.get(
        url, params=params, timeout=TIMEOUT, headers={"User-Agent": "MyCID/1.0 (Reisen)"}
    )
    antwort.raise_for_status()
    return antwort.json()


def zeitzone_gueltig(name: str) -> str:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, TypeError, OSError):
        return ""
    return name


# --- Zielort auflösen -----------------------------------------------------------------------


def _schluessel(reise) -> str:
    return f"{reise.ziel_ort.strip().lower()}|{reise.land.strip().lower()}"


def _suche(ort: str, land: str) -> dict | None:
    daten = _get_json(GEOCODING, {"name": ort, "count": 5, "language": "de", "format": "json"})
    treffer = daten.get("results") or []
    land_klein = land.strip().lower()
    if not land_klein:
        return treffer[0] if treffer else None
    for t in treffer:
        if land_klein in (
            str(t.get("country", "")).lower(),
            str(t.get("country_code", "")).lower(),
        ):
            return t
    return treffer[0] if len(treffer) == 1 else None  # Schreibweise des Landes weicht ab


def ziel_aufloesen(reise) -> bool:
    """Koordinaten, Zeitzone und Währung des Ziels bestimmen und an der Reise merken."""
    if not reise.ziel_ort.strip():
        return False
    schluessel = _schluessel(reise)
    if reise.ziel_schluessel == schluessel and reise.ziel_breite is not None:
        return True
    fehler_key = f"reisen:geo-fehler:{schluessel}"
    if cache.get(fehler_key):
        return False
    try:
        treffer = _suche(reise.ziel_ort.strip(), reise.land)
    except (requests.RequestException, ValueError) as exc:
        logger.warning("Zielort %r nicht aufgelöst: %s", reise.ziel_ort, exc)
        treffer = None
    if not treffer:
        cache.set(fehler_key, 1, FEHLER_TTL)
        return False
    reise.ziel_breite = float(treffer["latitude"])
    reise.ziel_laenge = float(treffer["longitude"])
    reise.ziel_zeitzone = zeitzone_gueltig(str(treffer.get("timezone", "")))
    reise.ziel_waehrung = WAEHRUNG_NACH_LAND.get(str(treffer.get("country_code", "")).upper(), "")
    reise.ziel_schluessel = schluessel
    reise.save(
        update_fields=[
            "ziel_breite",
            "ziel_laenge",
            "ziel_zeitzone",
            "ziel_waehrung",
            "ziel_schluessel",
        ]
    )
    return True


# --- Wetter ---------------------------------------------------------------------------------


def _fenster(start: date | None, ende: date | None, heute: date) -> tuple[date, date]:
    """Welche Tage sollen gezeigt werden : die Reisetage, sonst die nächsten Tage."""
    if start is None:
        return heute, heute + timedelta(days=4)
    von = max(start, heute)
    bis = ende or start + timedelta(days=2)
    return von, min(max(bis, von), von + timedelta(days=MAX_TAGE - 1))


def _wetter_rohdaten(breite: float, laenge: float) -> dict:
    key = f"reisen:wetter:{breite:.2f}:{laenge:.2f}"
    daten = cache.get(key)
    if daten is None:
        daten = _get_json(
            WETTER,
            {
                "latitude": f"{breite:.4f}",
                "longitude": f"{laenge:.4f}",
                "current": "temperature_2m,weather_code,is_day",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
                "forecast_days": VORHERSAGE_TAGE,
            },
        )
        cache.set(key, daten, WETTER_TTL)
    return daten


def wetter(reise, heute: date | None = None) -> dict | None:
    if reise.ziel_breite is None or reise.ziel_laenge is None:
        return None
    heute = heute or timezone.localdate()
    try:
        roh = _wetter_rohdaten(reise.ziel_breite, reise.ziel_laenge)
        tagesdaten = roh["daily"]
        tage = [
            {
                "datum": d,
                "code": int(c) if c is not None else None,
                "max": round(mx) if mx is not None else None,
                "min": round(mn) if mn is not None else None,
            }
            for d, c, mx, mn in zip(
                tagesdaten["time"],
                tagesdaten["weather_code"],
                tagesdaten["temperature_2m_max"],
                tagesdaten["temperature_2m_min"],
                strict=False,
            )
        ]
        aktuell = roh.get("current") or {}
        jetzt = None
        if aktuell.get("temperature_2m") is not None:
            jetzt = {
                "temp": round(aktuell["temperature_2m"]),
                "code": aktuell.get("weather_code"),
                "tag": bool(aktuell.get("is_day", 1)),
            }
    except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
        logger.warning("Wetter nicht verfügbar: %s", exc)
        return None
    von, bis = _fenster(reise.start, reise.ende, heute)
    ausgewaehlt = [t for t in tage if von.isoformat() <= t["datum"] <= bis.isoformat()]
    daten = {"jetzt": jetzt, "tage": ausgewaehlt, "vorhersage_ab": None}
    if not ausgewaehlt and reise.start and reise.start > heute:
        daten["vorhersage_ab"] = (reise.start - timedelta(days=VORHERSAGE_TAGE - 1)).isoformat()
    return daten


# --- Kurs -----------------------------------------------------------------------------------


def kurs(waehrung: str) -> dict | None:
    if not waehrung or waehrung == "EUR":
        return None
    try:
        daten = cache.get("reisen:kurse")
        if daten is None:
            roh = _get_json(KURSE, {})
            if roh.get("result") != "success":
                raise ValueError("Kurse nicht verfügbar")
            daten = {"rates": roh["rates"], "stand": roh.get("time_last_update_utc", "")}
            cache.set("reisen:kurse", daten, KURS_TTL)
        wert = daten["rates"].get(waehrung)
    except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
        logger.warning("Kurs nicht verfügbar: %s", exc)
        return None
    if not wert:
        return None
    return {"code": waehrung, "kurs": round(float(wert), 4), "stand": daten["stand"][5:16]}


# --- Gesamtbild -----------------------------------------------------------------------------


def zusammenstellen(reise) -> dict:
    if not ziel_aufloesen(reise):
        return {"verfuegbar": False}
    return {
        "verfuegbar": True,
        "ort": reise.ziel_ort,
        "land": reise.land,
        "zeitzone": reise.ziel_zeitzone or None,
        "wetter": wetter(reise),
        "kurs": kurs(reise.ziel_waehrung),
        "sicherheit": SICHERHEIT,
    }

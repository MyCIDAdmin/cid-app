"""Ländersteckbriefe automatisch erzeugen (Nov. 2026).

Der automatische Teil (Währung, Zeitverschiebung, Steckdose, Link zu den Hinweisen des
Auswärtigen Amts) wird bei jedem Abruf aus der festen Tabelle `laender_tabelle` berechnet und nie
gespeichert. Dadurch ist er immer so aktuell wie die ausgelieferte Tabelle und die Zeitzonendaten,
und er kann Ergänzungen des Bureau nie überschreiben. Ergänzungen stehen getrennt in den Feldern
von `Laenderprofil` (Einreise, weitere Infos und optional abweichende Werte)."""

from __future__ import annotations

import logging
import re
import unicodedata
from datetime import date, datetime, time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import IntegrityError, transaction

from .laender_tabelle import AA_BASIS, DATEN_STAND, LAENDER

logger = logging.getLogger(__name__)

BERLIN = ZoneInfo("Europe/Berlin")

# Gängige Schreibweisen, die die Tabelle nicht liefert (normalisiert → ISO).
ALIASE = {
    "usa": "US",
    "amerika": "US",
    "vereinigte staaten von amerika": "US",
    "united states": "US",
    "uk": "GB",
    "england": "GB",
    "schottland": "GB",
    "wales": "GB",
    "nordirland": "GB",
    "grossbritannien": "GB",
    "great britain": "GB",
    "tuerkei": "TR",
    "turkiye": "TR",
    "tschechische republik": "CZ",
    "bosnien": "BA",
    "mazedonien": "MK",
    "elfenbeinkueste": "CI",
    "cote d'ivoire": "CI",
    "korea": "KR",
    "suedkorea": "KR",
    "russische foederation": "RU",
    "holland": "NL",
    "vae": "AE",
    "emirate": "AE",
    "palaestina": "PS",
    "kosovo": "XK",
}


def normalisiere(text: str) -> str:
    """Klein, ohne Akzente (ä→a, é→e), ß→ss, nur Buchstaben/Ziffern und einfache Leerzeichen."""
    t = (text or "").strip().lower().replace("ß", "ss")
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9' ]", " ", t)).strip()


def _index() -> dict[str, str]:
    index: dict[str, str] = {}
    for iso, zeile in LAENDER.items():
        for name in zeile[:3]:
            index.setdefault(normalisiere(name), iso)
    # Umschriebene Umlaute (Tuerkei, Aegypten) wie in den Aliasen und der Eingabe von Hand.
    for iso, zeile in LAENDER.items():
        de = zeile[0].lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
        index.setdefault(normalisiere(de.replace("ß", "ss")), iso)
    for alias, iso in ALIASE.items():
        index[normalisiere(alias)] = iso
    return index


_INDEX: dict[str, str] | None = None


def finde_iso(land: str) -> str | None:
    """ISO-Code zu einem Ländernamen in Deutsch, Französisch oder Englisch (oder `None`)."""
    global _INDEX
    if _INDEX is None:
        _INDEX = _index()
    roh = (land or "").strip().lower()
    umschrieben = roh.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    return _INDEX.get(normalisiere(roh)) or _INDEX.get(normalisiere(umschrieben))


def deutscher_name(iso: str) -> str:
    return LAENDER[iso][0]


def _versatz(zone: str, zeitpunkt: datetime) -> float | None:
    try:
        lokal = zeitpunkt.replace(tzinfo=ZoneInfo(zone))
    except ZoneInfoNotFoundError:
        return None
    unterschied = lokal.utcoffset() - zeitpunkt.replace(tzinfo=BERLIN).utcoffset()
    return unterschied.total_seconds() / 3600


def zeitverschiebung(zonen, bezug: date | None = None) -> dict:
    """Stunden Unterschied zur deutschen Zeit am Bezugstag ; bei mehreren Zeitzonen mit
    verschiedenem Versatz `mehrere=True` (dann ohne Stundenangabe)."""
    zeitpunkt = datetime.combine(bezug or date.today(), time(12, 0))
    werte = {w for z in zonen if (w := _versatz(z, zeitpunkt)) is not None}
    if not werte:
        return {"stunden": None, "mehrere": False}
    if len(werte) > 1:
        return {"stunden": None, "mehrere": True}
    stunden = werte.pop()
    return {"stunden": int(stunden) if stunden == int(stunden) else stunden, "mehrere": False}


def auto_daten(iso: str, bezug: date | None = None) -> dict | None:
    """Automatischer Teil des Steckbriefs ; Texte mehrsprachig als Daten, das Frontend setzt sie in
    die Sprache der Person."""
    zeile = LAENDER.get(iso)
    if zeile is None:
        return None
    de, fr, _en, w, w_de, w_fr, zonen, aa, typen, spannung, frequenz = zeile
    return {
        "iso": iso,
        "name": {"de": de, "fr": fr},
        "waehrung": {"code": w, "name": {"de": w_de, "fr": w_fr}} if w else None,
        "zeitverschiebung": zeitverschiebung(zonen, bezug) if zonen else None,
        "steckdose": (
            {"typen": typen, "spannung": spannung, "frequenz": frequenz} if typen else None
        ),
        "amtliche_hinweise_url": f"{AA_BASIS}/{aa}-node" if aa else AA_BASIS,
        "stand": DATEN_STAND.isoformat(),
    }


def stelle_profil_sicher(land: str):
    """Steckbrief zum Land: vorhandenen finden (Name oder ISO) oder automatisch anlegen. Ein
    unbekanntes Land ergibt `None` (das Bureau legt es von Hand an)."""
    from .models import Laenderprofil

    schluessel = (land or "").strip().lower()
    if not schluessel:
        return None
    iso = finde_iso(land)
    profil = Laenderprofil.objects.filter(land_schluessel=schluessel).first()
    if profil is None and iso:
        profil = Laenderprofil.objects.filter(iso_code=iso).first()
    if profil is not None:
        if iso and not profil.iso_code:
            profil.iso_code = iso
            profil.save(update_fields=["iso_code"])
        return profil
    if not iso:
        return None
    try:
        with transaction.atomic():
            return Laenderprofil.objects.create(land=deutscher_name(iso), iso_code=iso)
    except IntegrityError:  # gleichzeitig angelegt
        return Laenderprofil.objects.filter(iso_code=iso).first()


def ergaenze_alle() -> int:
    """Legt für jedes Reiseland einen fehlenden Steckbrief an und füllt fehlende ISO-Codes. Gibt
    die Zahl neu angelegter Steckbriefe zurück."""
    from .models import Laenderprofil, Reise

    laender = set(Reise.objects.exclude(land="").values_list("land", flat=True))
    neu = 0
    for land in sorted(laender):
        vorher = Laenderprofil.objects.count()
        try:
            stelle_profil_sicher(land)
        except Exception:  # noqa: BLE001 — ein Land darf die übrigen nicht verhindern
            logger.exception("Steckbrief für %s konnte nicht angelegt werden", land)
        neu += Laenderprofil.objects.count() - vorher
    return neu

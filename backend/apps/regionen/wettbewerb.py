"""Regionen-Wettbewerb (Release 30) : Buchung ins Punkte-Journal, Rangliste, Verlauf, Abzeichen.

Alle Punkte sind einzelne Journal-Einträge (`PunkteEintrag`) ; die Rangliste ist deren Summe je
Saison. Automatisch gebucht wird nur nach dem Büro-Abschluss eines Treffens und beim Aktivwerden
eines früheren Fan-Kontos. Jede Buchung ist über `schluessel` wiederholbar (keine Doppelungen)."""

import datetime
import logging

from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from . import services
from .models import (
    PunkteEintrag,
    PunkteGrund,
    Region,
    Saison,
    Teilnahme,
    Veranstaltung,
    VeranstaltungStatus,
    WettbewerbEinstellung,
)

logger = logging.getLogger(__name__)

ABZEICHEN_ERSTES_TREFFEN = "erstes_treffen"
ABZEICHEN_ZEHN_TREFFEN = "zehn_treffen"
ABZEICHEN_FLEISSIGSTE = "fleissigste_region"


def heute() -> datetime.date:
    return timezone.localdate()


def saison_fuer(datum: datetime.date) -> Saison | None:
    return Saison.objects.filter(start__lte=datum, ende__gte=datum).first()


def anzuzeigende_saison() -> Saison | None:
    """Die laufende Saison ; sonst die zuletzt beendete, sonst die nächste."""
    laufend = saison_fuer(heute())
    if laufend is not None:
        return laufend
    return (
        Saison.objects.filter(ende__lt=heute()).order_by("-ende").first()
        or Saison.objects.order_by("start").first()
    )


def _buchbar(datum: datetime.date) -> Saison | None:
    saison = saison_fuer(datum)
    return None if saison is None or saison.eingefroren_am else saison


def _eintrag(schluessel: str | None, **felder) -> PunkteEintrag | None:
    """Legt den Eintrag an ; ein bereits gebuchter Schlüssel wird nicht doppelt gebucht."""
    if schluessel and PunkteEintrag.objects.filter(schluessel=schluessel).exists():
        return None
    try:
        with transaction.atomic():
            return PunkteEintrag.objects.create(schluessel=schluessel, **felder)
    except IntegrityError:
        return None


def buche_veranstaltung(v: Veranstaltung) -> list[PunkteEintrag]:
    """Bucht ein vom Büro abgeschlossenes Treffen : Grundpunkte, Anwesende (mit Obergrenze) und
    Erstteilnehmer. Über der Monatsgrenze der Region zählt das Treffen mit 0 Punkten."""
    saison = _buchbar(v.datum)
    if saison is None:
        logger.info("Treffen %s : keine offene Saison, keine Punkte", v.pk)
        return []
    regeln = WettbewerbEinstellung.holen()
    gebucht: list[PunkteEintrag] = []
    gemeinsam = {"saison": saison, "region_id": v.region_id, "veranstaltung": v, "datum": v.datum}

    schon = (
        PunkteEintrag.objects.filter(
            saison=saison,
            region_id=v.region_id,
            grund=PunkteGrund.VERANSTALTUNG,
            punkte__gt=0,
            datum__year=v.datum.year,
            datum__month=v.datum.month,
        )
        .exclude(veranstaltung=v)
        .count()
    )
    zaehlt = schon < regeln.max_treffen_monat
    basis = _eintrag(
        f"v:{v.pk}:basis",
        grund=PunkteGrund.VERANSTALTUNG,
        punkte=regeln.punkte_veranstaltung if zaehlt else 0,
        begruendung="" if zaehlt else "Obergrenze der Treffen pro Monat erreicht",
        **gemeinsam,
    )
    if basis is None or not zaehlt:
        return [basis] if basis else []
    gebucht.append(basis)

    anwesende = list(v.teilnahmen.filter(anwesend=True).values_list("user_id", flat=True))
    gezaehlt = min(len(anwesende), regeln.max_anwesende)
    if gezaehlt and regeln.punkte_anwesend:
        eintrag = _eintrag(
            f"v:{v.pk}:anwesend",
            grund=PunkteGrund.ANWESENHEIT,
            punkte=gezaehlt * regeln.punkte_anwesend,
            anzahl=gezaehlt,
            **gemeinsam,
        )
        if eintrag:
            gebucht.append(eintrag)

    if anwesende and regeln.punkte_erstteilnehmer:
        frueher = (
            Teilnahme.objects.filter(
                user_id__in=anwesende,
                anwesend=True,
                veranstaltung__status=VeranstaltungStatus.ABGESCHLOSSEN,
                veranstaltung__abgeschlossen_am__lt=v.abgeschlossen_am or timezone.now(),
            )
            .exclude(veranstaltung=v)
            .values_list("user_id", flat=True)
            .distinct()
        )
        neue = min(len(set(anwesende) - set(frueher)), gezaehlt)
        if neue:
            eintrag = _eintrag(
                f"v:{v.pk}:erst",
                grund=PunkteGrund.ERSTTEILNEHMER,
                punkte=neue * regeln.punkte_erstteilnehmer,
                anzahl=neue,
                **gemeinsam,
            )
            if eintrag:
                gebucht.append(eintrag)
    return gebucht


def buche_neumitglied(user) -> PunkteEintrag | None:
    """Bonus für die Region, wenn ein früheres Fan-Konto aktives Mitglied wird (einmal je Konto)."""
    fan = getattr(user, "fan_profil", None)
    membre = getattr(user, "membre", None)
    if fan is None or membre is None or fan.mitgliedsantrag_am is None:
        return None
    region = services.region_von_gebiet(membre.pays, membre.land_de) or services.region_von_gebiet(
        fan.pays, fan.land_de
    )
    saison = _buchbar(heute())
    regeln = WettbewerbEinstellung.holen()
    if region is None or saison is None or not regeln.punkte_neumitglied:
        return None
    return _eintrag(
        f"m:{fan.pk}",
        saison=saison,
        region=region,
        grund=PunkteGrund.NEUMITGLIED,
        punkte=regeln.punkte_neumitglied,
        anzahl=1,
        datum=heute(),
    )


def nachbuchen(saison: Saison) -> int:
    """Bucht bereits abgeschlossene Treffen des Zeitraums nach (z. B. vor Anlage der Saison)."""
    if saison.eingefroren_am:
        return 0
    zahl = 0
    treffen = Veranstaltung.objects.filter(
        status=VeranstaltungStatus.ABGESCHLOSSEN, datum__gte=saison.start, datum__lte=saison.ende
    ).order_by("datum", "abgeschlossen_am")
    for v in treffen:
        zahl += len(buche_veranstaltung(v))
    return zahl


# --- Auswertung ----------------------------------------------------------------------------


def _monat(datum: datetime.date) -> str:
    return f"{datum.year}-{datum.month:02d}"


def _monate(saison: Saison, bis: datetime.date) -> list[str]:
    ende = min(saison.ende, bis)
    monate, jahr, monat = [], saison.start.year, saison.start.month
    while (jahr, monat) <= (ende.year, ende.month):
        monate.append(f"{jahr}-{monat:02d}")
        jahr, monat = (jahr + 1, 1) if monat == 12 else (jahr, monat + 1)
    return monate


def _treffen_gesamt() -> dict:
    """Gezählte Treffen je Region über alle Saisons (für die Abzeichen)."""
    zeilen = (
        PunkteEintrag.objects.filter(grund=PunkteGrund.VERANSTALTUNG, punkte__gt=0)
        .values("region_id")
        .annotate(n=Count("id"))
    )
    return {z["region_id"]: z["n"] for z in zeilen}


def monatssieger(saison: Saison) -> list[dict]:
    """Fleißigste Region je abgeschlossenem Monat (die meisten Punkte ; Gleichstand teilt sich)."""
    heute_ = heute()
    abgeschlossen = [
        m
        for m in _monate(saison, saison.ende)
        if saison.eingefroren_am or m < _monat(heute_) or saison.ende < heute_
    ]
    siege = []
    for m in abgeschlossen:
        jahr, monat = (int(t) for t in m.split("-"))
        zeilen = (
            PunkteEintrag.objects.filter(saison=saison, datum__year=jahr, datum__month=monat)
            .values("region__slug")
            .annotate(s=Sum("punkte"))
            .filter(s__gt=0)
        )
        best = max((z["s"] for z in zeilen), default=0)
        if best:
            siege.append(
                {
                    "monat": m,
                    "regionen": sorted(z["region__slug"] for z in zeilen if z["s"] == best),
                }
            )
    return siege


def _abzeichen(region: Region, treffen: int, siege: list[dict]) -> list[dict]:
    erg = []
    if treffen >= 1:
        erg.append({"key": ABZEICHEN_ERSTES_TREFFEN, "anzahl": 1})
    if treffen >= 10:
        erg.append({"key": ABZEICHEN_ZEHN_TREFFEN, "anzahl": 1})
    gewonnen = sum(1 for s in siege if region.slug in s["regionen"])
    if gewonnen:
        erg.append({"key": ABZEICHEN_FLEISSIGSTE, "anzahl": gewonnen})
    return erg


def rangliste(saison: Saison) -> tuple[list[dict], list[dict]]:
    """Rangliste (Punkte pro Mitglied, dann Gesamtpunkte) und die Monatssieger der Saison."""
    siege = monatssieger(saison)
    summen = {
        z["region_id"]: z["s"]
        for z in PunkteEintrag.objects.filter(saison=saison)
        .values("region_id")
        .annotate(s=Sum("punkte"))
    }
    treffen = _treffen_gesamt()
    saison_treffen = {
        z["region_id"]: z["n"]
        for z in PunkteEintrag.objects.filter(
            saison=saison, grund=PunkteGrund.VERANSTALTUNG, punkte__gt=0
        )
        .values("region_id")
        .annotate(n=Count("id"))
    }
    regionen = Region.objects.filter(Q(aktiv=True) | Q(id__in=list(summen))).order_by(
        "reihenfolge", "name"
    )
    zeilen = []
    for r in regionen:
        punkte = summen.get(r.id, 0)
        mitglieder = services.mitglieder_zahl(r)
        zeilen.append(
            {
                "region": {"slug": r.slug, "name": r.name, "farbe": r.farbe},
                "punkte": punkte,
                "mitglieder": mitglieder,
                "punkte_pro_mitglied": round(punkte / max(mitglieder, 1), 2),
                "treffen": saison_treffen.get(r.id, 0),
                "abzeichen": _abzeichen(r, treffen.get(r.id, 0), siege),
            }
        )
    zeilen.sort(key=lambda z: (-z["punkte_pro_mitglied"], -z["punkte"], z["region"]["name"]))
    letzter, rang = None, 0
    for position, z in enumerate(zeilen, start=1):
        schluessel = (z["punkte_pro_mitglied"], z["punkte"])
        if schluessel != letzter:
            rang, letzter = position, schluessel
        z["rang"] = rang
    return zeilen, siege


def verlauf(saison: Saison) -> dict:
    """Aufgelaufene Punkte je Region am Ende jedes Monats der Saison."""
    monate = _monate(saison, heute())
    pro_monat: dict = {}
    for z in (
        PunkteEintrag.objects.filter(saison=saison)
        .values("region_id", "datum__year", "datum__month")
        .annotate(s=Sum("punkte"))
    ):
        pro_monat[(z["region_id"], f"{z['datum__year']}-{z['datum__month']:02d}")] = z["s"]
    ids = {rid for rid, _ in pro_monat}
    serien = []
    for r in Region.objects.filter(Q(aktiv=True) | Q(id__in=ids)).order_by("reihenfolge", "name"):
        summe, werte = 0, []
        for m in monate:
            summe += pro_monat.get((r.id, m), 0)
            werte.append(summe)
        serien.append({"slug": r.slug, "name": r.name, "farbe": r.farbe, "werte": werte})
    return {"monate": monate, "serien": serien}


def platz_von(region: Region) -> dict | None:
    """Platz und Punkte einer Region in der angezeigten Saison (für die Regionsseite)."""
    saison = anzuzeigende_saison()
    if saison is None:
        return None
    zeilen = _eingefroren(saison, "rangliste") or rangliste(saison)[0]
    for z in zeilen:
        if z["region"]["slug"] == region.slug:
            return {
                "saison": saison.name,
                "rang": z["rang"],
                "punkte": z["punkte"],
                "regionen": len(zeilen),
            }
    return None


def _eingefroren(saison: Saison, schluessel: str):
    snap = saison.rangliste_eingefroren
    return snap.get(schluessel) if snap else None


def tabelle(saison: Saison) -> dict:
    """Auswertung einer Saison ; eingefroren = gespeicherte Momentaufnahme."""
    if saison.eingefroren_am and saison.rangliste_eingefroren:
        snap = saison.rangliste_eingefroren
        return {
            "rangliste": snap["rangliste"],
            "monatssieger": snap["monatssieger"],
            "verlauf": snap["verlauf"],
        }
    zeilen, siege = rangliste(saison)
    return {"rangliste": zeilen, "monatssieger": siege, "verlauf": verlauf(saison)}


def einfrieren(saison: Saison) -> Saison:
    """Speichert die Rangliste als Momentaufnahme ; danach werden keine Punkte mehr gebucht."""
    daten = tabelle(saison)
    saison.rangliste_eingefroren = daten
    saison.eingefroren_am = timezone.now()
    saison.save(update_fields=["rangliste_eingefroren", "eingefroren_am"])
    return saison


def ewige_tabelle() -> list[dict]:
    """Punkte aller eingefrorenen Saisons je Region."""
    summe: dict = {}
    for s in Saison.objects.filter(eingefroren_am__isnull=False):
        for z in (s.rangliste_eingefroren or {}).get("rangliste", []):
            slug = z["region"]["slug"]
            eintrag = summe.setdefault(slug, {"region": z["region"], "punkte": 0, "saisons": 0})
            eintrag["punkte"] += z["punkte"]
            eintrag["saisons"] += 1
    return sorted(summe.values(), key=lambda e: (-e["punkte"], e["region"]["name"]))

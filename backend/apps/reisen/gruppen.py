"""Teilgruppen und gemeinsame Ankunft/Abfahrt.

Teilgruppen legt die Organisation von Hand an (die App schlägt sie nur vor, aus Angaben, die die
Organisation ohnehin sehen darf). Die gemeinsame Ankunft vergleicht ausschließlich Personen, die
das ausdrücklich erlaubt haben ; Namen erscheinen erst, wenn beide Seiten zugestimmt haben."""

from collections import defaultdict
from datetime import timedelta

from django.utils import timezone

from . import services as sv
from .models import (
    AnkunftsTyp,
    AnkunftZustimmung,
    ReiseTeilnehmer,
    Richtung,
    Teilgruppe,
    TeilgruppeMitglied,
    TStatus,
)

FENSTER = timedelta(hours=2)


def schluessel(ort: str) -> str:
    return " ".join((ort or "").lower().split())


# --- Teilgruppen ---------------------------------------------------------------------------


def gruppe_dict(g: Teilgruppe, ctx, mitglieder: list) -> dict:
    """Name und Größe sehen alle Mitreisenden ; die Namen nur Mitglieder und Organisation."""
    eigene = ctx.tn is not None and g.id in ctx.gruppen_ids
    d = {
        "id": str(g.id),
        "name": g.name,
        "anzahl": len(mitglieder),
        "ich_bin_mitglied": eigene,
    }
    if eigene or ctx.darf_verwalten:
        d["mitglieder"] = [
            {"id": str(t.id), "user": str(t.user_id), "name": sv.name_von(t.user)}
            for t in mitglieder
        ]
    return d


def gruppen_liste(ctx) -> list[dict]:
    gruppen = list(ctx.reise.teilgruppen.all())
    mitglieder = defaultdict(list)
    for m in TeilgruppeMitglied.objects.filter(teilgruppe__reise=ctx.reise).select_related(
        "teilnehmer__user__membre"
    ):
        mitglieder[m.teilgruppe_id].append(m.teilnehmer)
    return [gruppe_dict(g, ctx, mitglieder[g.id]) for g in gruppen]


def mitglieder_setzen(gruppe: Teilgruppe, teilnehmer_ids: list) -> int:
    """Ersetzt die Mitglieder (nur Personen, die dabei sind). Gibt die neue Größe zurück."""
    gueltig = {
        str(t.pk): t
        for t in gruppe.reise.teilnehmer.filter(status=TStatus.DABEI, pk__in=teilnehmer_ids)
    }
    TeilgruppeMitglied.objects.filter(teilgruppe=gruppe).exclude(
        teilnehmer__in=gueltig.values()
    ).delete()
    for t in gueltig.values():
        TeilgruppeMitglied.objects.get_or_create(teilgruppe=gruppe, teilnehmer=t)
    return len(gueltig)


def vorschlaege(ctx) -> list[dict]:
    """Nur für die Organisation : gleiche Abflugorte und gleiche Unterkünfte, soweit die Person
    ihre Angaben nicht vor der Organisation verbirgt."""
    nach_ort, nach_unterkunft = defaultdict(list), defaultdict(list)
    dabei = (
        ctx.reise.teilnehmer.filter(status=TStatus.DABEI)
        .select_related("user__membre", "unterkunft")
        .prefetch_related("etappen")
    )
    for tn in dabei:
        if tn.verbergen_vor_orga:
            continue
        hin = sorted(
            (e for e in tn.etappen.all() if e.richtung == Richtung.HIN and e.von_ort.strip()),
            key=lambda e: (e.abfahrt is None, e.abfahrt),
        )
        if hin:
            nach_ort[schluessel(hin[0].von_ort)].append((hin[0].von_ort.strip(), tn))
        if tn.unterkunft_id:
            nach_unterkunft[tn.unterkunft.name].append((tn.unterkunft.name, tn))
    ergebnis = []
    for art, gruppen in (("abflug", nach_ort), ("unterkunft", nach_unterkunft)):
        for liste in gruppen.values():
            if len(liste) < 2:
                continue
            name = liste[0][0]
            ergebnis.append(
                {
                    "art": art,
                    "name": f"Abflug {name}" if art == "abflug" else name,
                    "teilnehmer": [str(t.pk) for _n, t in liste],
                    "namen": [sv.name_von(t.user) for _n, t in liste],
                }
            )
    return sorted(ergebnis, key=lambda v: (-len(v["teilnehmer"]), v["name"]))


# --- Gemeinsame Ankunft / Abfahrt ----------------------------------------------------------


def _eckpunkte(tn: ReiseTeilnehmer) -> list[dict]:
    """Eigene Ankunft (letzte Hinreise-Etappe) und Abfahrt (erste Hinreise-Etappe)."""
    hin = [e for e in tn.etappen.all() if e.richtung == Richtung.HIN]
    punkte = []
    mit_ankunft = sorted(
        (e for e in hin if e.ankunft and e.nach_ort.strip()), key=lambda e: e.ankunft
    )
    if mit_ankunft:
        e = mit_ankunft[-1]
        punkte.append({"typ": AnkunftsTyp.ANKUNFT, "ort": e.nach_ort.strip(), "zeit": e.ankunft})
    mit_abfahrt = sorted(
        (e for e in hin if e.abfahrt and e.von_ort.strip()), key=lambda e: e.abfahrt
    )
    if mit_abfahrt:
        e = mit_abfahrt[0]
        punkte.append({"typ": AnkunftsTyp.ABFAHRT, "ort": e.von_ort.strip(), "zeit": e.abfahrt})
    return punkte


def _tag(zeit):
    return timezone.localtime(zeit).date()


def gemeinsame_ankunft(ctx) -> dict:
    """Vergleich für Personen, die „offen für gemeinsame Anreise“ eingeschaltet haben."""
    tn = ctx.tn
    if tn is None or tn.status != TStatus.DABEI:
        return {"offen": False, "gruppen": []}
    if not tn.offen_gemeinsame_anreise:
        return {"offen": False, "gruppen": []}
    andere = list(
        ctx.reise.teilnehmer.filter(status=TStatus.DABEI, offen_gemeinsame_anreise=True)
        .exclude(pk=tn.pk)
        .select_related("user__membre")
        .prefetch_related("etappen")
    )
    meine_ja = {
        (z.typ, z.ort_schluessel, z.tag) for z in AnkunftZustimmung.objects.filter(teilnehmer=tn)
    }
    zustimmungen = defaultdict(set)
    for z in AnkunftZustimmung.objects.filter(teilnehmer__in=andere):
        zustimmungen[z.teilnehmer_id].add((z.typ, z.ort_schluessel, z.tag))
    gruppen = []
    for p in _eckpunkte(tn):
        key = (p["typ"], schluessel(p["ort"]), _tag(p["zeit"]))
        passende = []
        for o in andere:
            for q in _eckpunkte(o):
                if (
                    q["typ"] == p["typ"]
                    and schluessel(q["ort"]) == key[1]
                    and _tag(q["zeit"]) == key[2]
                    and abs(q["zeit"] - p["zeit"]) <= FENSTER
                ):
                    passende.append((o, q["zeit"]))
                    break
        if not passende:
            continue
        zeiten = [p["zeit"], *[z for _o, z in passende]]
        ich_ja = key in meine_ja
        gegenseitig = [o for o, _z in passende if ich_ja and key in zustimmungen[o.pk]]
        gruppen.append(
            {
                "typ": p["typ"],
                "ort": p["ort"],
                "tag": key[2].isoformat(),
                "von": timezone.localtime(min(zeiten)).strftime("%H:%M"),
                "bis": timezone.localtime(max(zeiten)).strftime("%H:%M"),
                "weitere": len(passende),
                "ich_zugestimmt": ich_ja,
                "kontakte": sorted(sv.name_von(o.user) for o in gegenseitig),
            }
        )
    return {"offen": True, "gruppen": gruppen}


def zustimmen(ctx, typ: str, ort: str, tag, ja: bool) -> None:
    """Zustimmung setzen/zurücknehmen. Nur für eine Gruppe, die es für die Person gibt."""
    if typ not in AnkunftsTyp.values:
        raise ValueError("Unbekannte Art.")
    key = (typ, schluessel(ort), tag)
    if not ja:
        AnkunftZustimmung.objects.filter(
            teilnehmer=ctx.tn, typ=typ, ort_schluessel=key[1], tag=key[2]
        ).delete()
        return
    gefunden = any(
        (g["typ"], schluessel(g["ort"]), g["tag"]) == (key[0], key[1], key[2].isoformat())
        for g in gemeinsame_ankunft(ctx)["gruppen"]
    )
    if not gefunden:
        raise ValueError("Für diese Angabe gibt es keine Gruppe.")
    AnkunftZustimmung.objects.get_or_create(
        teilnehmer=ctx.tn, typ=typ, ort_schluessel=key[1], tag=key[2]
    )

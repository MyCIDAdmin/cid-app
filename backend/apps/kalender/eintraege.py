"""Zusammenstellung der Kalendereinträge (eigene Termine + schreibgeschützter Feed)."""

from django.db.models import Q

from .feed import feed_eintraege
from .models import TerminEinladung, Wiederholung
from .services import ist_verwaltung, sichtbare_termine, uebersetzungen_fuer, vorkommen

# Welche Feed-Quellen in welcher Ansicht erscheinen.
FEED_QUELLEN = {
    "verein": {"event", "spieltag", "umfrage", "abstimmung"},
    "buero": {"event", "aufgabe"},
    "meine": {"aufgabe"},
}


def _termin_dict(t, start, ende, trans, antworten, schreiben):
    return {
        "id": f"termin:{t.pk}:{start.isoformat()}",
        "quelle": "termin",
        "termin_id": str(t.pk),
        "titel": t.titel,
        "beschreibung": t.beschreibung,
        "ort": t.ort,
        "link": t.link,
        "kategorie": t.kategorie,
        "beginn": start,
        "ende": ende,
        "ganztaegig": t.ganztaegig,
        "sichtbarkeit": t.sichtbarkeit,
        "kreis": t.kreis,
        "projekt": str(t.projekt_id) if t.projekt_id else None,
        "projekt_titel": t.projekt.titre if t.projekt_id else "",
        "wichtig": t.wichtig,
        "wiederholung": t.wiederholung,
        "status": t.status,
        "meine_antwort": antworten.get(t.pk),
        "editierbar": schreiben,
        "uebersetzungen": trans.get(str(t.pk), {}),
    }


def baue_eintraege(user, ansicht, von, bis) -> list[dict]:
    schreiben = ist_verwaltung(user, schreiben=True) if user is not None else False
    zeitraum = Q(beginn__gte=von) | Q(ende__gte=von) | ~Q(wiederholung=Wiederholung.KEINE)
    termine = list(
        sichtbare_termine(user, ansicht).filter(zeitraum, beginn__lt=bis).select_related("projekt")
    )
    antworten = {}
    if user is not None and getattr(user, "is_authenticated", False) and termine:
        antworten = dict(
            TerminEinladung.objects.filter(user=user, termin__in=termine).values_list(
                "termin_id", "antwort"
            )
        )
    feed = [
        e
        for e in feed_eintraege(user, von, bis, nur_oeffentlich=user is None)
        if user is None or e["quelle"] in FEED_QUELLEN.get(ansicht, set())
    ]
    trans = uebersetzungen_fuer(termine + [e["_objekt"] for e in feed if "_objekt" in e])

    ergebnis = []
    for t in termine:
        for start, ende in vorkommen(t, von, bis):
            ergebnis.append(_termin_dict(t, start, ende, trans, antworten, schreiben))
    for e in feed:
        objekt = e.pop("_objekt", None)
        if objekt is not None:
            roh = trans.get(str(objekt.pk), {})
            e["uebersetzungen"] = {
                "titel": roh.get("titre", {}),
                "beschreibung": roh.get("description", {}),
            }
        ergebnis.append(e)
    ergebnis.sort(key=lambda x: x["beginn"])
    return ergebnis

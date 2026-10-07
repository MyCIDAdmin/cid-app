"""Pivot-Auswertung (Nutzerwunsch 2026-10-06 : "Tab mit Pivot, um dynamisch und dimensional auf
Basis unterschiedlicher Dimensionen und Kennzahlen zu reporten") — erweitert am 2026-10-07 :
mehrere Dimensionen je Achse, mehrere Kennzahlen gleichzeitig, Filter, Einnahmen und Ausgaben
getrennt (vorher wurden beide in einem Betrag saldiert).

Datengrundlage sind die Buchungen aus apps.stats.bilan.ecritures_comptables (Einnahmen aller
Quellen + freigegebene Ausgaben) über mehrere Jahre. Der Aufrufer wählt 1-3 Zeilen- und 0-3
Spaltendimensionen, 1-5 Kennzahlen und optionale Filter ; das Ergebnis enthält die Matrix samt
Summen.
"""

import csv
import io
from collections import defaultdict
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Font

from .bilan import ecritures_comptables
from .exports import _ecrire_en_tete

DIMENSIONEN = ("jahr", "quartal", "monat", "typ", "kategorie", "gegenpartei")
KENNZAHLEN = ("einnahmen", "ausgaben", "saldo", "anzahl", "durchschnitt")
MAX_DIMENSIONEN = 3
FILTER_MAX_WERTE = 50

LABELS = {
    "de": {
        "jahr": "Jahr",
        "quartal": "Quartal",
        "monat": "Monat",
        "typ": "Typ",
        "kategorie": "Kategorie",
        "gegenpartei": "Gegenpartei",
        "einnahmen": "Einnahmen (€)",
        "ausgaben": "Ausgaben (€)",
        "saldo": "Saldo (€)",
        "anzahl": "Anzahl Buchungen",
        "durchschnitt": "Ø Buchung (€)",
        "summe": "Summe",
        "ohne": "(ohne)",
        "blatt": "Pivot",
    },
    "fr": {
        "jahr": "Année",
        "quartal": "Trimestre",
        "monat": "Mois",
        "typ": "Type",
        "kategorie": "Catégorie",
        "gegenpartei": "Contrepartie",
        "einnahmen": "Recettes (€)",
        "ausgaben": "Dépenses (€)",
        "saldo": "Solde (€)",
        "anzahl": "Nombre d'écritures",
        "durchschnitt": "Moy. écriture (€)",
        "summe": "Total",
        "ohne": "(vide)",
        "blatt": "Pivot",
    },
}
TYP_FR = {"Einnahme": "Recette", "Ausgabe": "Dépense"}
# Filterwerte für "typ" kommen sprachunabhängig als "einnahme"/"ausgabe".
TYP_ROH = {"einnahme": "Einnahme", "ausgabe": "Ausgabe"}


def _wert(zeile, dimension, langue):
    d = zeile["datum"]
    if dimension == "jahr":
        return str(d.year)
    if dimension == "quartal":
        return f"{d.year}-Q{(d.month - 1) // 3 + 1}"
    if dimension == "monat":
        return f"{d.year}-{d.month:02d}"
    if dimension == "typ":
        return zeile["typ"] if langue == "de" else TYP_FR.get(zeile["typ"], zeile["typ"])
    if dimension == "kategorie":
        return zeile["kategorie"]
    return zeile["gegenpartei"]


def buchungen_laden(jahr_von, jahr_bis, langue="de"):
    zeilen = []
    for jahr in range(jahr_von, jahr_bis + 1):
        zeilen.extend(ecritures_comptables(jahr, langue))
    return zeilen


def _passt(buchung, filter_, langue):
    """Filter : {dimension: [werte]} ; "typ" nimmt einnahme/ausgabe, "gegenpartei" ist eine
    Teilzeichenfolge-Suche (Groß-/Kleinschreibung egal), alle anderen exakte Werte (ODER
    innerhalb einer Dimension, UND zwischen Dimensionen)."""
    for dim, werte in filter_.items():
        if not werte:
            continue
        if dim == "typ":
            if buchung["typ"] not in {TYP_ROH.get(w.lower(), w) for w in werte}:
                return False
        elif dim == "gegenpartei":
            name = (buchung["gegenpartei"] or "").lower()
            if not any(w.lower() in name for w in werte):
                return False
        elif _wert(buchung, dim, langue) not in werte:
            return False
    return True


def filter_optionen(jahr_von, jahr_bis, langue="de") -> dict:
    """Auswahlwerte für die Filter (Kategorien + Typen) im angegebenen Zeitraum."""
    buchungen = buchungen_laden(jahr_von, jahr_bis, langue)
    return {
        "kategorie": sorted({b["kategorie"] for b in buchungen if b["kategorie"]}),
        "typ": ["einnahme", "ausgabe"],
    }


def pivot_berechnen(
    *,
    zeilen_dims,
    spalten_dims=(),
    kennzahlen=("saldo",),
    jahr_von,
    jahr_bis,
    langue="de",
    filter_=None,
) -> dict:
    zeilen_dims, spalten_dims, kennzahlen = list(zeilen_dims), list(spalten_dims), list(kennzahlen)
    alle = zeilen_dims + spalten_dims
    if not zeilen_dims or len(zeilen_dims) > MAX_DIMENSIONEN or len(spalten_dims) > MAX_DIMENSIONEN:
        raise ValueError("dimension")
    if any(d not in DIMENSIONEN for d in alle) or len(set(alle)) != len(alle):
        raise ValueError("dimension")
    if not kennzahlen or any(k not in KENNZAHLEN for k in kennzahlen):
        raise ValueError("kennzahl")
    filter_ = filter_ or {}
    ohne = LABELS[langue]["ohne"]
    buchungen = [
        b for b in buchungen_laden(jahr_von, jahr_bis, langue) if _passt(b, filter_, langue)
    ]

    # Je Schlüssel (Zeile, Spalte) : [Einnahmen, Ausgaben, Anzahl, Summe der Beträge (absolut)]
    summen = defaultdict(lambda: [Decimal("0"), Decimal("0"), 0, Decimal("0")])
    for b in buchungen:
        z = tuple(_wert(b, d, langue) or ohne for d in zeilen_dims)
        s = tuple(_wert(b, d, langue) or ohne for d in spalten_dims)
        betrag = Decimal(str(b["betrag"]))
        for schluessel in ((z, s), (z, None), (None, s), (None, None)):
            eintrag = summen[schluessel]
            if betrag >= 0:
                eintrag[0] += betrag
            else:
                eintrag[1] += -betrag
            eintrag[2] += 1
            eintrag[3] += abs(betrag)

    def zahlen(schluessel):
        einnahmen, ausgaben, n, absolut = summen.get(
            schluessel, [Decimal("0"), Decimal("0"), 0, Decimal("0")]
        )
        werte = {
            "einnahmen": float(round(einnahmen, 2)),
            "ausgaben": float(round(ausgaben, 2)),
            "saldo": float(round(einnahmen - ausgaben, 2)),
            "anzahl": n,
            "durchschnitt": float(round(absolut / n, 2)) if n else 0,
        }
        return [werte[k] for k in kennzahlen]

    zeilen_keys = sorted({k[0] for k in summen if k[0] is not None})
    spalten_keys = (
        sorted({k[1] for k in summen if k[1] is not None and k[1] != ()}) if spalten_dims else []
    )
    return {
        "zeilen_dims": zeilen_dims,
        "spalten_dims": spalten_dims,
        "kennzahlen": kennzahlen,
        "jahr_von": jahr_von,
        "jahr_bis": jahr_bis,
        "filter": {k: list(v) for k, v in filter_.items() if v},
        "spalten": [{"labels": list(k), "label": " / ".join(k)} for k in spalten_keys],
        "zeilen": [
            {
                "labels": list(z),
                "label": " / ".join(z),
                "werte": [zahlen((z, s)) for s in spalten_keys],
                "summe": zahlen((z, None)),
            }
            for z in zeilen_keys
        ],
        "spalten_summen": [zahlen((None, s)) for s in spalten_keys],
        "gesamt": zahlen((None, None)),
        "anzahl_buchungen": len(buchungen),
    }


def _tabelle(ergebnis, langue):
    lab = LABELS[langue]
    kz = ergebnis["kennzahlen"]
    kopf = [" / ".join(lab[d] for d in ergebnis["zeilen_dims"])]

    def spaltenkopf(label):
        return [f"{label} – {lab[k]}" if label and len(kz) > 1 else (label or lab[k]) for k in kz]

    for sp in ergebnis["spalten"]:
        kopf += spaltenkopf(sp["label"])
    kopf += spaltenkopf(lab["summe"]) if ergebnis["spalten"] or len(kz) > 1 else [lab["summe"]]
    zeilen = [
        [z["label"], *[w for werte in z["werte"] for w in werte], *z["summe"]]
        for z in ergebnis["zeilen"]
    ]
    zeilen.append(
        [
            lab["summe"],
            *[w for werte in ergebnis["spalten_summen"] for w in werte],
            *ergebnis["gesamt"],
        ]
    )
    return kopf, zeilen


def pivot_csv(ergebnis, langue="de") -> str:
    kopf, zeilen = _tabelle(ergebnis, langue)
    puffer = io.StringIO()
    puffer.write("﻿")
    w = csv.writer(puffer, delimiter=";", lineterminator="\r\n")
    w.writerow(kopf)
    for z in zeilen:
        w.writerow([str(x).replace(".", ",") if isinstance(x, float) else x for x in z])
    return puffer.getvalue()


def pivot_excel(ergebnis, langue="de") -> Workbook:
    kopf, zeilen = _tabelle(ergebnis, langue)
    kz = ergebnis["kennzahlen"]
    lab = LABELS[langue]
    classeur = Workbook()
    blatt = classeur.active
    blatt.title = lab["blatt"]
    _ecrire_en_tete(blatt, kopf)
    for i, z in enumerate(zeilen, start=2):
        for j, x in enumerate(z, start=1):
            zelle = blatt.cell(row=i, column=j, value=x)
            if j > 1 and kz[(j - 2) % len(kz)] != "anzahl":
                zelle.number_format = '#,##0.00 "€"'
            if i == len(zeilen) + 1:
                zelle.font = Font(bold=True)
    blatt.column_dimensions["A"].width = 34
    return classeur

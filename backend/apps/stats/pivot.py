"""Pivot-Auswertung (Nutzerwunsch 2026-10-06 : "Tab mit Pivot, um dynamisch und dimensional auf
Basis unterschiedlicher Dimensionen und Kennzahlen zu reporten").

Datengrundlage sind die Buchungen aus apps.stats.bilan.ecritures_comptables (Einnahmen aller
Quellen + freigegebene Ausgaben) über mehrere Jahre. Der Aufrufer wählt eine Zeilen- und eine
(optionale) Spaltendimension sowie eine Kennzahl ; das Ergebnis enthält die Matrix samt Summen.
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
KENNZAHLEN = ("betrag", "anzahl", "durchschnitt")

LABELS = {
    "de": {
        "jahr": "Jahr",
        "quartal": "Quartal",
        "monat": "Monat",
        "typ": "Typ",
        "kategorie": "Kategorie",
        "gegenpartei": "Gegenpartei",
        "betrag": "Betrag (€)",
        "anzahl": "Anzahl Buchungen",
        "durchschnitt": "Durchschnitt (€)",
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
        "betrag": "Montant (€)",
        "anzahl": "Nombre d'écritures",
        "durchschnitt": "Moyenne (€)",
        "summe": "Total",
        "ohne": "(vide)",
        "blatt": "Pivot",
    },
}
TYP_FR = {"Einnahme": "Recette", "Ausgabe": "Dépense"}


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


def pivot_berechnen(
    *, zeilen_dim, spalten_dim=None, kennzahl="betrag", jahr_von, jahr_bis, langue="de"
) -> dict:
    if zeilen_dim not in DIMENSIONEN or (spalten_dim and spalten_dim not in DIMENSIONEN):
        raise ValueError("dimension")
    if kennzahl not in KENNZAHLEN:
        raise ValueError("kennzahl")
    ohne = LABELS[langue]["ohne"]
    buchungen = []
    for jahr in range(jahr_von, jahr_bis + 1):
        buchungen.extend(ecritures_comptables(jahr, langue))

    summen = defaultdict(Decimal)
    anzahlen = defaultdict(int)
    for b in buchungen:
        z = _wert(b, zeilen_dim, langue) or ohne
        s = (_wert(b, spalten_dim, langue) or ohne) if spalten_dim else ""
        for schluessel in ((z, s), (z, None), (None, s), (None, None)):
            summen[schluessel] += Decimal(str(b["betrag"]))
            anzahlen[schluessel] += 1

    def zahl(schluessel):
        if kennzahl == "anzahl":
            return anzahlen.get(schluessel, 0)
        if kennzahl == "durchschnitt":
            n = anzahlen.get(schluessel, 0)
            return float(round(summen[schluessel] / n, 2)) if n else 0
        return float(round(summen.get(schluessel, Decimal("0")), 2))

    zeilen = sorted({k[0] for k in summen if k[0] is not None})
    spalten = sorted({k[1] for k in summen if k[1] not in (None, "")}) if spalten_dim else []
    spalten_keys = spalten if spalten_dim else [""]
    return {
        "zeilen_dim": zeilen_dim,
        "spalten_dim": spalten_dim,
        "kennzahl": kennzahl,
        "jahr_von": jahr_von,
        "jahr_bis": jahr_bis,
        "spalten": spalten,
        "zeilen": [
            {
                "label": z,
                "werte": [zahl((z, s)) for s in spalten] if spalten_dim else [],
                "summe": zahl((z, None)),
            }
            for z in zeilen
        ],
        "spalten_summen": [zahl((None, s)) for s in spalten_keys] if spalten_dim else [],
        "gesamt": zahl((None, None)),
        "anzahl_buchungen": len(buchungen),
    }


def _tabelle(ergebnis, langue):
    lab = LABELS[langue]
    kopf = [lab[ergebnis["zeilen_dim"]]]
    if ergebnis["spalten_dim"]:
        kopf += list(ergebnis["spalten"])
    kopf.append(lab["summe"])
    zeilen = [[z["label"], *z["werte"], z["summe"]] for z in ergebnis["zeilen"]]
    zeilen.append([lab["summe"], *ergebnis["spalten_summen"], ergebnis["gesamt"]])
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
    lab = LABELS[langue]
    classeur = Workbook()
    blatt = classeur.active
    blatt.title = lab["blatt"]
    _ecrire_en_tete(blatt, kopf)
    for i, z in enumerate(zeilen, start=2):
        for j, x in enumerate(z, start=1):
            zelle = blatt.cell(row=i, column=j, value=x)
            if j > 1 and ergebnis["kennzahl"] != "anzahl":
                zelle.number_format = '#,##0.00 "€"'
            if i == len(zeilen) + 1 or j == len(z):
                zelle.font = Font(bold=True)
    blatt.column_dimensions["A"].width = 34
    return classeur

"""Export Excel de la Jahresbilanz (2026-10-06) — classeur multi-feuilles avec formules pour les
totaux/écarts, afin que le service financier puisse corriger/compléter les chiffres à la main."""

from openpyxl import Workbook
from openpyxl.styles import Font

from . import i18n
from .exports import _ecrire_en_tete

TEXTE = {
    "de": {
        "sources": {
            "cotisations": "Beiträge",
            "dons": "Spenden",
            "projets": "Projekte",
            "adhesions": "Mitgliedschaften",
            "boutique": "Shop",
            "evenements": "Veranstaltungen",
        },
        "bilan": "Bilanz",
        "budget_ist": "Budget vs. Ist",
        "mensuel": "Monatlich",
        "res_ev": "Ergebnis Veranstaltungen",
        "res_pr": "Ergebnis Projekte",
        "ausgaben_blatt": "Ausgaben",
        "posten": "Posten",
        "einnahmen": "EINNAHMEN",
        "summe_einnahmen": "Summe Einnahmen",
        "ausgaben": "AUSGABEN",
        "summe_ausgaben": "Summe Ausgaben",
        "ergebnis": "ERGEBNIS",
        "abweichung": "Abweichung",
        "kategorie": "Kategorie",
        "budget": "Budget",
        "ist": "Ist",
        "prozent": "% des Budgets",
        "status": "Status",
        "monat": "Monat",
        "einn": "Einnahmen",
        "ausg": "Ausgaben",
        "erg": "Ergebnis",
        "kumuliert": "Kumuliert",
        "titel": "Titel",
        "datum": "Datum",
        "lieferant": "Lieferant",
        "betrag": "Betrag",
        "veranstaltung": "Veranstaltung",
        "projekt": "Projekt",
        "erfasst": "Erfasst von",
        "entschieden": "Entschieden von",
        "budget_status": {
            "aucun": "Kein Budget",
            "ok": "Im Rahmen",
            "attention": "Achtung",
            "depasse": "Überschritten",
        },
        "csv": [
            "Datum",
            "Typ",
            "Kategorie",
            "Beschreibung",
            "Gegenpartei",
            "Betrag (EUR)",
            "Beleg",
            "Referenz",
        ],
    },
    "fr": {
        "sources": {
            "cotisations": "Cotisations",
            "dons": "Dons",
            "projets": "Projets",
            "adhesions": "Adhésions",
            "boutique": "Boutique",
            "evenements": "Événements",
        },
        "bilan": "Bilan",
        "budget_ist": "Budget vs Réel",
        "mensuel": "Mensuel",
        "res_ev": "Résultat événements",
        "res_pr": "Résultat projets",
        "ausgaben_blatt": "Dépenses",
        "posten": "Poste",
        "einnahmen": "RECETTES",
        "summe_einnahmen": "Total recettes",
        "ausgaben": "DÉPENSES",
        "summe_ausgaben": "Total dépenses",
        "ergebnis": "RÉSULTAT",
        "abweichung": "Écart",
        "kategorie": "Catégorie",
        "budget": "Budget",
        "ist": "Réel",
        "prozent": "% du budget",
        "status": "Statut",
        "monat": "Mois",
        "einn": "Recettes",
        "ausg": "Dépenses",
        "erg": "Résultat",
        "kumuliert": "Cumul",
        "titel": "Titre",
        "datum": "Date",
        "lieferant": "Fournisseur",
        "betrag": "Montant",
        "veranstaltung": "Événement",
        "projekt": "Projet",
        "erfasst": "Saisi par",
        "entschieden": "Décidé par",
        "budget_status": {
            "aucun": "Aucun budget",
            "ok": "Dans le budget",
            "attention": "Attention",
            "depasse": "Dépassé",
        },
        "csv": [
            "Date",
            "Type",
            "Catégorie",
            "Description",
            "Contrepartie",
            "Montant (EUR)",
            "Justificatif",
            "Référence",
        ],
    },
}
TYP_CSV = {"Einnahme": "Recette", "Ausgabe": "Dépense"}
EUR = '#,##0.00 "€"'
GRAS = Font(bold=True)


def _f(valeur):
    return float(valeur)


def construire_classeur_bilan(bilan, depenses, langue="de") -> Workbook:
    x = TEXTE.get(langue, TEXTE["de"])
    langue = langue if langue in TEXTE else "de"
    classeur = Workbook()

    # --- Bilan : recettes puis dépenses par catégorie, avec total/résultat en formules.
    feuille = classeur.active
    feuille.title = x["bilan"]
    annee = bilan["annee"]
    _ecrire_en_tete(feuille, [x["posten"], str(annee), str(annee - 1), x["abweichung"]])
    ligne = 2
    feuille.cell(row=ligne, column=1, value=x["einnahmen"]).font = GRAS
    debut = ligne + 1
    for r in bilan["recettes"]["lignes"]:
        ligne += 1
        feuille.cell(row=ligne, column=1, value=x["sources"][r["cle"]])
        feuille.cell(row=ligne, column=2, value=_f(r["montant"]))
        feuille.cell(row=ligne, column=3, value=_f(r["montant_precedent"]))
        feuille.cell(row=ligne, column=4, value=f"=B{ligne}-C{ligne}")
    ligne += 1
    total_rec = ligne
    feuille.cell(row=ligne, column=1, value=x["summe_einnahmen"]).font = GRAS
    for col in "BC":
        feuille[f"{col}{ligne}"] = f"=SUM({col}{debut}:{col}{ligne - 1})"
    feuille[f"D{ligne}"] = f"=B{ligne}-C{ligne}"
    ligne += 2
    feuille.cell(row=ligne, column=1, value=x["ausgaben"]).font = GRAS
    debut = ligne + 1
    for d in bilan["depenses"]["lignes"]:
        ligne += 1
        feuille.cell(row=ligne, column=1, value=d["namen"].get(langue) or d["nom"])
        feuille.cell(row=ligne, column=2, value=_f(d["montant"]))
        feuille.cell(row=ligne, column=3, value=_f(d["montant_precedent"]))
        feuille.cell(row=ligne, column=4, value=f"=B{ligne}-C{ligne}")
    ligne += 1
    total_dep = ligne
    feuille.cell(row=ligne, column=1, value=x["summe_ausgaben"]).font = GRAS
    for col in "BC":
        feuille[f"{col}{ligne}"] = f"=SUM({col}{debut}:{col}{ligne - 1})"
    feuille[f"D{ligne}"] = f"=B{ligne}-C{ligne}"
    ligne += 2
    feuille.cell(row=ligne, column=1, value=x["ergebnis"]).font = GRAS
    for col in "BC":
        feuille[f"{col}{ligne}"] = f"={col}{total_rec}-{col}{total_dep}"
    feuille[f"D{ligne}"] = f"=B{ligne}-C{ligne}"
    for row in feuille.iter_rows(min_row=2, min_col=2, max_col=4):
        for cellule in row:
            cellule.number_format = EUR
    feuille.column_dimensions["A"].width = 38

    # --- Budget vs. Ist
    feuille = classeur.create_sheet(x["budget_ist"])
    _ecrire_en_tete(
        feuille, [x["kategorie"], x["budget"], x["ist"], x["abweichung"], x["prozent"], x["status"]]
    )
    for i, d in enumerate(bilan["depenses"]["lignes"], start=2):
        feuille.cell(row=i, column=1, value=d["namen"].get(langue) or d["nom"])
        feuille.cell(row=i, column=2, value=_f(d["budget"])).number_format = EUR
        feuille.cell(row=i, column=3, value=_f(d["montant"])).number_format = EUR
        feuille.cell(row=i, column=4, value=f"=B{i}-C{i}").number_format = EUR
        feuille.cell(row=i, column=5, value=f'=IF(B{i}=0,"",C{i}/B{i})').number_format = "0.0%"
        feuille.cell(
            row=i, column=6, value=x["budget_status"].get(d["statut_budget"], d["statut_budget"])
        )
    feuille.column_dimensions["A"].width = 38

    # --- Mensuel
    feuille = classeur.create_sheet(x["mensuel"])
    _ecrire_en_tete(feuille, [x["monat"], x["einn"], x["ausg"], x["erg"], x["kumuliert"]])
    for i, m in enumerate(bilan["mensuel"], start=2):
        feuille.cell(row=i, column=1, value=m["mois"])
        feuille.cell(row=i, column=2, value=_f(m["recettes"])).number_format = EUR
        feuille.cell(row=i, column=3, value=_f(m["depenses"])).number_format = EUR
        feuille.cell(row=i, column=4, value=f"=B{i}-C{i}").number_format = EUR
        feuille.cell(row=i, column=5, value=f"=SUM(D$2:D{i})").number_format = EUR

    # --- Événements et projets
    for titre, cle in (
        (x["res_ev"], "resultats_evenements"),
        (x["res_pr"], "resultats_projets"),
    ):
        feuille = classeur.create_sheet(titre)
        _ecrire_en_tete(feuille, [x["titel"], x["einn"], x["ausg"], x["erg"]])
        for i, e in enumerate(bilan[cle], start=2):
            feuille.cell(row=i, column=1, value=e["titre"])
            feuille.cell(row=i, column=2, value=_f(e["recettes"])).number_format = EUR
            feuille.cell(row=i, column=3, value=_f(e["depenses"])).number_format = EUR
            feuille.cell(row=i, column=4, value=f"=B{i}-C{i}").number_format = EUR
        feuille.column_dimensions["A"].width = 38

    # --- Détail des dépenses
    feuille = classeur.create_sheet(x["ausgaben_blatt"])
    _ecrire_en_tete(
        feuille,
        [
            x["datum"],
            x["lieferant"],
            x["kategorie"],
            x["betrag"],
            x["status"],
            x["veranstaltung"],
            x["projekt"],
            x["erfasst"],
            x["entschieden"],
        ],
    )
    for i, d in enumerate(depenses, start=2):
        valeurs = [
            d.date_depense.strftime("%d.%m.%Y"),
            d.fournisseur,
            d.categorie.namen.get(langue) or d.categorie.nom,
            _f(d.montant),
            i18n.status(d.statut, langue),
            d.evenement.titre if d.evenement else "",
            d.projet.titre if d.projet else "",
            d.saisie_par.email if d.saisie_par else "",
            d.decide_par.email if d.decide_par else "",
        ]
        for col, v in enumerate(valeurs, start=1):
            feuille.cell(row=i, column=col, value=v)
        feuille.cell(row=i, column=4).number_format = EUR
    return classeur


def construire_csv_buchungen(zeilen, langue="de") -> str:
    """CSV für den Steuerberater : Semikolon, Dezimalkomma, Datum TT.MM.JJJJ, UTF-8 mit BOM
    (öffnet in Excel/DATEV-Importen ohne Umlaut-Probleme). Ausgaben stehen negativ."""
    import csv
    import io

    puffer = io.StringIO()
    puffer.write("\ufeff")
    w = csv.writer(puffer, delimiter=";", lineterminator="\r\n")
    w.writerow(TEXTE.get(langue, TEXTE["de"])["csv"])
    for z in zeilen:
        w.writerow(
            [
                z["datum"].strftime("%d.%m.%Y"),
                z["typ"] if langue == "de" else TYP_CSV.get(z["typ"], z["typ"]),
                z["kategorie"],
                z["beschreibung"],
                z["gegenpartei"],
                f"{z['betrag']:.2f}".replace(".", ","),
                z["beleg"],
                z["referenz"],
            ]
        )
    return puffer.getvalue()

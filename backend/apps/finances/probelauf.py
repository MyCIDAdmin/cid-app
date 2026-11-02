"""Probelauf des Jahresabschlusses und Daten für das Finanz-Cockpit (rein lesend).

Nichts in diesem Modul schreibt in die Datenbank: Der Probelauf zeigt die Zahlen eines Jahres,
eine Prüfliste und eine Bewertung — und kann offene Ausgaben/Beiträge probehalber einrechnen
(„Was wäre wenn?“). Der eigentliche Abschluss bleibt `AbschlussView.post`.

Texte der Auswertung werden NICHT hier formuliert: Das Backend liefert Codes mit Parametern,
das Frontend übersetzt sie (DE/FR).
"""

import copy
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.projets.models import Projet, StatutProjet
from apps.stats.bilan import SEUIL_ATTENTION, _statut_budget, bilan_annuel

from . import budget as budgetregeln
from .models import BudgetAnnuel, Depense, Jahresabschluss, StatutDepense

ZERO = Decimal("0.00")
# Vorschlag (mit Satzung/Vorstand abzugleichen): bis wann das Vorjahr abgeschlossen sein sollte.
FRIST_ABSCHLUSS = (3, 31)
# Ab diesem Monat wird die Budgetplanung für das Folgejahr als Aufgabe angezeigt.
BUDGET_PLANUNG_AB_MONAT = 10


def _summe(qs, feld="montant") -> Decimal:
    return qs.aggregate(t=Sum(feld))["t"] or ZERO


def _offene_ausgaben(annee: int):
    return Depense.objects.filter(date_depense__year=annee, statut=StatutDepense.EN_ATTENTE)


def _ohne_beleg(annee: int):
    return Depense.objects.filter(date_depense__year=annee, statut=StatutDepense.APPROUVEE).filter(
        Q(justificatif="") | Q(justificatif__isnull=True)
    )


def _offene_beitraege(annee: int):
    return Cotisation.objects.filter(
        type_article=TypeArticle.COTISATION, statut=StatutCotisation.EN_ATTENTE, annee=annee
    )


def _projekte_offen(annee: int):
    """Laufende Projekte, die im Jahr bereits freigegebene Kosten haben."""
    ids = (
        Depense.objects.filter(
            date_depense__year=annee, statut=StatutDepense.APPROUVEE, projet__isnull=False
        )
        .values_list("projet_id", flat=True)
        .distinct()
    )
    return Projet.objects.filter(id__in=ids, statut=StatutProjet.EN_COURS)


def pruefliste(annee: int) -> list:
    """Automatische Prüfpunkte. `stufe`: pflicht = blockiert den Abschluss, empfohlen = Hinweis."""
    offen = _offene_ausgaben(annee)
    beleg = _ohne_beleg(annee)
    beitraege = _offene_beitraege(annee)
    projekte = _projekte_offen(annee)
    gesamt = budgetregeln.gesamtbudget(annee)
    verteilt = budgetregeln.zugeteilt(annee)
    punkte = [
        {
            "id": "freigaben",
            "stufe": "pflicht",
            "anzahl": offen.count(),
            "betrag": _summe(offen),
            "ziel": "depenses",
        },
        {
            "id": "belege",
            "stufe": "empfohlen",
            "anzahl": beleg.count(),
            "betrag": _summe(beleg),
            "ziel": "pruefung",
        },
        {
            "id": "beitraege",
            "stufe": "empfohlen",
            "anzahl": beitraege.count(),
            "betrag": _summe(beitraege),
            "ziel": "zahlungen",
        },
        {
            "id": "projekte",
            "stufe": "empfohlen",
            "anzahl": projekte.count(),
            "betrag": ZERO,
            "ziel": "projekte",
        },
        {
            # Kein Gesamtbudget: der Plan-Ist-Vergleich ist dann nicht aussagekräftig.
            "id": "budget_gesetzt",
            "stufe": "empfohlen",
            "anzahl": 0 if gesamt > 0 else 1,
            "betrag": ZERO,
            "ziel": "budget",
        },
        {
            "id": "budget_passt",
            "stufe": "empfohlen",
            "anzahl": 1 if verteilt > gesamt else 0,
            "betrag": ZERO,
            "ziel": "budget",
        },
    ]
    for p in punkte:
        p["ok"] = p["anzahl"] == 0
    return punkte


def _kostenarten_neu_berechnen(kostenarten: list) -> None:
    for k in kostenarten:
        budget = k["budget"]
        k["prozent"] = round(float(k["montant"] / budget * 100), 1) if budget else None
        k["status"] = _statut_budget(budget, k["montant"])


def _einrechnen(bilan: dict, annee: int, ausgaben: bool, beitraege: bool) -> dict:
    """Rechnet offene Ausgaben/Beiträge probehalber in eine Kopie der Bilanz ein."""
    bilan = copy.deepcopy(bilan)
    if ausgaben:
        zeilen = {z["categorie_id"]: z for z in bilan["depenses"]["lignes"]}
        for d in _offene_ausgaben(annee).select_related("categorie"):
            zeile = zeilen.get(str(d.categorie_id))
            if zeile is None:
                zeile = {
                    "categorie_id": str(d.categorie_id),
                    "nom": d.categorie.nom,
                    "namen": d.categorie.namen,
                    "montant": ZERO,
                    "montant_precedent": ZERO,
                    "budget": BudgetAnnuel.objects.filter(annee=annee, categorie=d.categorie)
                    .values_list("montant", flat=True)
                    .first()
                    or ZERO,
                }
                zeilen[zeile["categorie_id"]] = zeile
                bilan["depenses"]["lignes"].append(zeile)
            zeile["montant"] += d.montant
            bilan["depenses"]["total"] += d.montant
    if beitraege:
        extra = _summe(_offene_beitraege(annee))
        for z in bilan["recettes"]["lignes"]:
            if z["cle"] == "cotisations":
                z["montant"] += extra
        bilan["recettes"]["total"] += extra
    bilan["resultat"] = bilan["recettes"]["total"] - bilan["depenses"]["total"]
    return bilan


def _bewertung(bilan: dict, kostenarten: list, punkte: list) -> dict:
    """Ampel + Auswertungs-Codes. rot = Pflicht offen, orange = Hinweise, grün = bereit."""
    pflicht = sum(1 for p in punkte if p["stufe"] == "pflicht" and not p["ok"])
    empfohlen = sum(1 for p in punkte if p["stufe"] == "empfohlen" and not p["ok"])
    ueber = [k for k in kostenarten if k["status"] == "depasse"]
    fast = [k for k in kostenarten if k["status"] == "attention"]
    if pflicht:
        ampel = "rot"
    elif empfohlen or ueber:
        ampel = "orange"
    else:
        ampel = "gruen"

    einnahmen, ausgaben = bilan["recettes"]["total"], bilan["depenses"]["total"]
    vorjahr_e = bilan["recettes"]["total_precedent"]
    hinweise = [
        {
            "code": "ergebnis",
            "stufe": "gut" if bilan["resultat"] >= 0 else "kritisch",
            "params": {
                "betrag": bilan["resultat"],
                "vorjahr": bilan["resultat_precedent"],
            },
        }
    ]
    budget_total = bilan["depenses"]["budget_total"]
    if budget_total:
        prozent = round(float(ausgaben / budget_total * 100))
        hinweise.append(
            {
                "code": "gesamtbudget",
                "stufe": "kritisch" if prozent > 100 else "achtung" if prozent >= 90 else "gut",
                "params": {"prozent": prozent, "ausgaben": ausgaben, "budget": budget_total},
            }
        )
    if vorjahr_e:
        hinweise.append(
            {
                "code": "einnahmen_vorjahr",
                "stufe": "gut" if einnahmen >= vorjahr_e else "achtung",
                "params": {"prozent": round(float((einnahmen - vorjahr_e) / vorjahr_e * 100))},
            }
        )
    if ueber:
        hinweise.append(
            {
                "code": "ueber_budget",
                "stufe": "kritisch",
                "params": {"anzahl": len(ueber), "namen": [k["nom"] for k in ueber]},
            }
        )
    if fast:
        hinweise.append(
            {
                "code": "fast_ausgeschoepft",
                "stufe": "achtung",
                "params": {"anzahl": len(fast), "namen": [k["nom"] for k in fast]},
            }
        )
    hinweise.append(
        {
            "code": "pruefliste",
            "stufe": "gut" if not (pflicht or empfohlen) else "achtung",
            "params": {"offen": pflicht + empfohlen},
        }
    )
    gesamt_punkte = len(punkte)
    bereit = round((gesamt_punkte - pflicht - empfohlen) / gesamt_punkte * 100)
    return {"ampel": ampel, "bereit_prozent": bereit, "hinweise": hinweise}


def probelauf(annee: int, offene_ausgaben: bool = False, offene_beitraege: bool = False) -> dict:
    """Vorschau auf den Jahresabschluss. Schreibt nichts."""
    punkte = pruefliste(annee)
    bilan = _einrechnen(bilan_annuel(annee), annee, offene_ausgaben, offene_beitraege)
    kostenarten = bilan["depenses"]["lignes"]
    _kostenarten_neu_berechnen(kostenarten)
    kostenarten.sort(key=lambda k: k["nom"])
    abschluss = Jahresabschluss.objects.filter(annee=annee, aktiv=True).first()
    return {
        "annee": annee,
        "abgeschlossen": abschluss is not None,
        "schwelle_attention": int(SEUIL_ATTENTION),
        "annahmen": {"offene_ausgaben": offene_ausgaben, "offene_beitraege": offene_beitraege},
        "pruefliste": punkte,
        "einnahmen": {
            "total": bilan["recettes"]["total"],
            "total_vorjahr": bilan["recettes"]["total_precedent"],
            "lignes": bilan["recettes"]["lignes"],
        },
        "ausgaben": {
            "total": bilan["depenses"]["total"],
            "total_vorjahr": bilan["depenses"]["total_precedent"],
            "budget_total": bilan["depenses"]["budget_total"],
        },
        "ergebnis": bilan["resultat"],
        "ergebnis_vorjahr": bilan["resultat_precedent"],
        "kostenarten": kostenarten,
        "bewertung": _bewertung(bilan, kostenarten, punkte),
    }


# --- Cockpit ------------------------------------------------------------------------------


def _prognose(annee: int, heute: date) -> dict:
    """Einfache Schätzung: Durchschnitt der letzten (bis zu) 3 abgeschlossenen Monate."""
    monatlich = {
        z["date_depense__month"]: z["t"] or ZERO
        for z in Depense.objects.filter(date_depense__year=annee, statut=StatutDepense.APPROUVEE)
        .values("date_depense__month")
        .annotate(t=Sum("montant"))
    }
    werte = [Decimal(monatlich.get(m, ZERO)) for m in range(1, 13)]
    aktuell = heute.month if heute.year == annee else 12
    kumuliert, summe = [], ZERO
    for i in range(aktuell):
        summe += werte[i]
        kumuliert.append(summe)
    abgeschlossen = werte[: max(aktuell - 1, 0)][-3:]
    schnitt = (sum(abgeschlossen, ZERO) / len(abgeschlossen)) if abgeschlossen else ZERO
    rest_monate = 12 - aktuell
    laufender = werte[aktuell - 1] if aktuell else ZERO
    rest_laufend = max(schnitt - laufender, ZERO) if heute.year == annee else ZERO
    prognose = summe + schnitt * rest_monate + rest_laufend
    return {
        "bisher": summe,
        "kumuliert": kumuliert,
        "monatsschnitt": schnitt.quantize(Decimal("0.01")),
        "jahresende": prognose.quantize(Decimal("0.01")),
    }


def cockpit(heute: date | None = None) -> dict:
    """Kennzahlen, Aufgaben (aus dem Stand der Daten abgeleitet) und Prognose."""
    heute = heute or timezone.localdate()
    jahr = heute.year
    vorjahr = jahr - 1

    # Offene Ausgaben früherer, noch nicht abgeschlossene Jahre zählen mit.
    alle_offen = Depense.objects.filter(statut=StatutDepense.EN_ATTENTE)
    belege = _ohne_beleg(jahr)
    beitraege = _offene_beitraege(jahr)
    projekte = _projekte_offen(jahr)

    gesamt = budgetregeln.gesamtbudget(jahr)
    verbraucht = _summe(
        Depense.objects.filter(date_depense__year=jahr, statut=StatutDepense.APPROUVEE)
    )
    jahr_prozent = round((heute - date(jahr, 1, 1)).days / 365 * 100)
    budget_prozent = round(float(verbraucht / gesamt * 100)) if gesamt else None

    vorjahr_abschluss = Jahresabschluss.objects.filter(annee=vorjahr, aktiv=True).first()
    folgejahr_budget = budgetregeln.gesamtbudget(jahr + 1)
    hatte_vorjahr_daten = Depense.objects.filter(date_depense__year=vorjahr).exists()

    aufgaben = []
    if alle_offen.exists():
        aufgaben.append(
            {
                "code": "freigaben",
                "rollen": ["fin"],
                "params": {"anzahl": alle_offen.count(), "betrag": _summe(alle_offen)},
                "faellig": heute,
                "ziel": "depenses",
            }
        )
    if belege.exists():
        aufgaben.append(
            {
                "code": "belege",
                "rollen": ["fin", "buero", "pruef"],
                "params": {"anzahl": belege.count(), "betrag": _summe(belege)},
                "faellig": heute + timedelta(days=7),
                "ziel": "pruefung",
            }
        )
    if beitraege.exists():
        aufgaben.append(
            {
                "code": "beitraege",
                "rollen": ["buero", "fin"],
                "params": {"anzahl": beitraege.count(), "betrag": _summe(beitraege)},
                "faellig": heute + timedelta(days=7),
                "ziel": "zahlungen",
            }
        )
    if projekte.exists():
        aufgaben.append(
            {
                "code": "projekte",
                "rollen": ["buero"],
                "params": {"anzahl": projekte.count()},
                "faellig": heute + timedelta(days=14),
                "ziel": "projekte",
            }
        )
    if vorjahr_abschluss is None and hatte_vorjahr_daten:
        aufgaben.append(
            {
                "code": "abschluss",
                "rollen": ["fin", "pruef"],
                "params": {"annee": vorjahr},
                "faellig": date(jahr, *FRIST_ABSCHLUSS),
                "ziel": "abschluss",
            }
        )
    if heute.month >= BUDGET_PLANUNG_AB_MONAT and folgejahr_budget <= 0:
        aufgaben.append(
            {
                "code": "budget_planen",
                "rollen": ["fin"],
                "params": {"annee": jahr + 1},
                "faellig": date(jahr, 12, 15),
                "ziel": "budget",
            }
        )
    aufgaben.sort(key=lambda a: a["faellig"])

    return {
        "annee": jahr,
        "stand": heute,
        "freigaben": {"anzahl": alle_offen.count(), "betrag": _summe(alle_offen)},
        "belege": {"anzahl": belege.count(), "betrag": _summe(belege)},
        "beitraege": {"anzahl": beitraege.count(), "betrag": _summe(beitraege)},
        "budget": {
            "gesamt": gesamt,
            "verbraucht": verbraucht,
            "prozent": budget_prozent,
            "jahr_prozent": jahr_prozent,
        },
        "vorjahr": {"annee": vorjahr, "abgeschlossen": vorjahr_abschluss is not None},
        "prognose": {**_prognose(jahr, heute), "budget": gesamt},
        "aufgaben": aufgaben,
    }

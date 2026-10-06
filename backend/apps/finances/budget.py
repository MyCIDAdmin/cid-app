"""Budgetregeln: Gesamtbudget, Kategorie-Budgets und Projekttopf eines Geschäftsjahres."""

from decimal import Decimal

from django.db.models import Sum
from rest_framework.exceptions import APIException

from .models import BudgetAnnuel, CategorieDepense, Gesamtbudget

ZERO = Decimal("0.00")


class BudgetFehler(APIException):
    status_code = 400
    default_code = "budget_ueberschritten"
    default_detail = "Das Budget würde überschritten."


def euro(betrag) -> str:
    return f"{Decimal(betrag):,.2f}".replace(",", " ").replace(".", ",") + " €"


def gesamtbudget(annee: int) -> Decimal:
    g = Gesamtbudget.objects.filter(annee=annee).first()
    return g.montant if g else ZERO


def zugeteilt(annee: int) -> Decimal:
    return BudgetAnnuel.objects.filter(annee=annee).aggregate(s=Sum("montant"))["s"] or ZERO


def projektkategorie():
    return CategorieDepense.objects.filter(projektbudget=True).first()


def projektbudget(annee: int) -> Decimal:
    kat = projektkategorie()
    if kat is None:
        return ZERO
    b = BudgetAnnuel.objects.filter(annee=annee, categorie=kat).first()
    return b.montant if b else ZERO


def uebersicht(annee: int) -> dict:
    from apps.projets.budget import geplante_summe  # lokal: finances ↔ projets

    gesamt = gesamtbudget(annee)
    verteilt = zugeteilt(annee)
    kat = projektkategorie()
    p_budget = projektbudget(annee)
    p_geplant = geplante_summe(annee)
    return {
        "annee": annee,
        "gesamt": gesamt,
        "zugeteilt": verteilt,
        "verfuegbar": gesamt - verteilt,
        "projekte": {
            "kategorie": kat.id if kat else None,
            "budget": p_budget,
            "geplant": p_geplant,
            "verfuegbar": p_budget - p_geplant,
        },
    }


def pruefe_kategorien(annee: int) -> None:
    """Die Kategorie-Budgets dürfen das Gesamtbudget nicht überschreiten, und der Projekttopf
    darf nicht unter die bereits geplanten Projektkosten fallen."""
    from apps.projets.budget import geplante_summe

    gesamt, verteilt = gesamtbudget(annee), zugeteilt(annee)
    if verteilt > gesamt:
        raise BudgetFehler(
            f"Die Kategorie-Budgets ({euro(verteilt)}) überschreiten das Gesamtbudget "
            f"{annee} ({euro(gesamt)})."
        )
    geplant, topf = geplante_summe(annee), projektbudget(annee)
    if geplant > topf:
        raise BudgetFehler(
            f"Das Projektbudget {annee} ({euro(topf)}) liegt unter den bereits geplanten "
            f"Projektkosten ({euro(geplant)})."
        )

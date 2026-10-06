"""Projekttopf: Die Plan-Kosten aller Projekte eines Jahres dürfen das Budget der Kategorie
„Projekte“ (apps.finances.budget.projektbudget) nicht überschreiten."""

from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce, ExtractYear

from .models import PlanKosten, Projet, StatutProjet

ZERO = Decimal("0.00")


def projekte_im_jahr(jahr: int):
    """Projekte (ohne abgesagte), deren Planjahr = `jahr` ist (Standard: Jahr der Frist, sonst
    Erstellungsjahr)."""
    return (
        Projet.objects.annotate(
            jahr_eff=Coalesce("plan_jahr", ExtractYear("date_limite"), ExtractYear("created_at"))
        )
        .filter(jahr_eff=jahr)
        .exclude(statut=StatutProjet.ANNULE)
    )


def geplante_summe(jahr: int, ausser_plan=None, ausser_projet=None) -> Decimal:
    qs = PlanKosten.objects.filter(projet__in=projekte_im_jahr(jahr))
    if ausser_plan is not None:
        qs = qs.exclude(pk=ausser_plan.pk)
    if ausser_projet is not None:
        qs = qs.exclude(projet=ausser_projet)
    return qs.aggregate(s=Sum("betrag"))["s"] or ZERO


def pruefe_plan(projet, betrag, ausser_plan=None) -> None:
    """Prüft, ob `betrag` für `projet` noch in den Projekttopf seines Jahres passt."""
    from apps.finances.budget import BudgetFehler, euro, projektbudget

    jahr = projet.budget_jahr
    topf = projektbudget(jahr)
    andere = geplante_summe(jahr, ausser_plan=ausser_plan)
    if andere + Decimal(betrag) > topf:
        frei = max(topf - andere, ZERO)
        raise BudgetFehler(
            f"Projektbudget {jahr} überschritten: {euro(frei)} von {euro(topf)} sind noch "
            f"verfügbar (Projekttopf der Finanzen)."
        )


def pruefe_jahreswechsel(projet, neues_jahr: int) -> None:
    """Beim Verschieben in ein anderes Jahr müssen die Plan-Kosten des Projekts dort passen."""
    from apps.finances.budget import BudgetFehler, euro, projektbudget

    eigene = PlanKosten.objects.filter(projet=projet).aggregate(s=Sum("betrag"))["s"] or ZERO
    topf = projektbudget(neues_jahr)
    andere = geplante_summe(neues_jahr, ausser_projet=projet)
    if andere + eigene > topf:
        raise BudgetFehler(
            f"Im Jahr {neues_jahr} sind nur noch {euro(max(topf - andere, ZERO))} Projektbudget "
            f"verfügbar, das Projekt plant {euro(eigene)}."
        )

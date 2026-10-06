"""Tests — Gesamtbudget, Kategorie-Budgets und Projekttopf (2026-10-06)."""

from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.finances.models import (
    BudgetAnnuel,
    CategorieDepense,
    FinanzProtokoll,
    Gesamtbudget,
    Jahresabschluss,
)
from apps.projets.models import PlanKosten
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

JAHR = 2027


@pytest.fixture
def fin():
    u = User.objects.create_user(
        email="bfin@example.de", password="Password123!", role=Role.DIR_FINANCIER, is_active=True
    )
    c = APIClient()
    c.force_authenticate(user=u)
    return c


@pytest.fixture
def kat():
    return CategorieDepense.objects.filter(projektbudget=False, actif=True).first()


@pytest.fixture
def projekte_kat():
    return CategorieDepense.objects.get(projektbudget=True)


def _gesamt(client, montant, jahr=JAHR):
    return client.post(
        reverse("finances:budget-gesamt"), {"annee": jahr, "montant": montant}, format="json"
    )


def _budget(client, zeilen, jahr=JAHR):
    return client.post(
        reverse("finances:budget"),
        {"annee": jahr, "lignes": [{"categorie": str(k.id), "montant": m} for k, m in zeilen]},
        format="json",
    )


def test_projektkategorie_ist_angelegt_und_uebersetzt(projekte_kat):
    assert CategorieDepense.objects.filter(projektbudget=True).count() == 1
    assert projekte_kat.namen["de"] == "Projekte"


def test_projektkategorie_nicht_deaktivierbar(fin, projekte_kat):
    r = fin.patch(
        reverse("finances:categorie-detail", args=[projekte_kat.id]),
        {"actif": False},
        format="json",
    )
    assert r.status_code == 400


def test_gesamtbudget_setzen_und_uebersicht(fin, kat):
    assert _gesamt(fin, "1000").status_code == 200
    assert _budget(fin, [(kat, "300")]).status_code == 200
    r = fin.get(reverse("finances:budget-uebersicht"), {"annee": JAHR})
    assert r.status_code == 200
    assert Decimal(r.data["gesamt"]) == 1000
    assert Decimal(r.data["zugeteilt"]) == 300
    assert Decimal(r.data["verfuegbar"]) == 700
    assert FinanzProtokoll.objects.filter(objekt_typ="gesamtbudget").count() == 1


def test_kategorie_budgets_duerfen_gesamtbudget_nicht_ueberschreiten(fin, kat):
    _gesamt(fin, "500")
    resp = _budget(fin, [(kat, "600")])
    assert resp.status_code == 400
    assert BudgetAnnuel.objects.count() == 0  # Rollback
    assert _budget(fin, [(kat, "500")]).status_code == 200


def test_ohne_gesamtbudget_keine_kategorie_budgets(fin, kat):
    assert _budget(fin, [(kat, "10")]).status_code == 400


def test_gesamtbudget_nicht_unter_verteilte_budgets(fin, kat):
    _gesamt(fin, "1000")
    _budget(fin, [(kat, "800")])
    assert _gesamt(fin, "700").status_code == 400
    assert Gesamtbudget.objects.get(annee=JAHR).montant == Decimal("1000.00")
    assert _gesamt(fin, "800").status_code == 200


def test_budgets_summieren_ueber_mehrere_kategorien(fin, kat, projekte_kat):
    _gesamt(fin, "1000")
    assert _budget(fin, [(kat, "600"), (projekte_kat, "500")]).status_code == 400
    assert _budget(fin, [(kat, "600"), (projekte_kat, "400")]).status_code == 200


def test_projekttopf_nicht_unter_geplante_projektkosten(fin, projekte_kat, kat):
    projet = ProjetFactory(plan_jahr=JAHR)
    PlanKosten.objects.create(projet=projet, categorie=kat, betrag=Decimal("300"))
    _gesamt(fin, "1000")
    assert _budget(fin, [(projekte_kat, "200")]).status_code == 400
    assert _budget(fin, [(projekte_kat, "300")]).status_code == 200
    ue = fin.get(reverse("finances:budget-uebersicht"), {"annee": JAHR}).data
    assert Decimal(ue["projekte"]["geplant"]) == 300
    assert Decimal(ue["projekte"]["verfuegbar"]) == 0


def test_geschlossenes_jahr_sperrt_gesamtbudget(fin):
    Jahresabschluss.objects.create(annee=JAHR, aktiv=True, abgeschlossen_am=timezone.now())
    assert _gesamt(fin, "10").status_code == 409


def test_nur_finanzen_duerfen_budget_sehen(kat):
    u = User.objects.create_user(
        email="bmem@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    c = APIClient()
    c.force_authenticate(user=u)
    assert c.get(reverse("finances:budget-uebersicht")).status_code == 403
    assert (
        c.post(reverse("finances:budget-gesamt"), {"annee": JAHR, "montant": 1}).status_code == 403
    )

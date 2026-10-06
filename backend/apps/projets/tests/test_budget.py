"""Tests — Projekttopf (2026-10-06): Plan-Kosten aller Projekte eines Planjahres dürfen das
Budget der Kategorie „Projekte“ nicht überschreiten."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.finances.models import BudgetAnnuel, CategorieDepense
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import PlanKosten, StatutProjet
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

JAHR = 2027


@pytest.fixture(autouse=True)
def _topf_500():
    kat = CategorieDepense.objects.get(projektbudget=True)
    BudgetAnnuel.objects.filter(annee=JAHR, categorie=kat).update(montant=Decimal("500"))


@pytest.fixture
def kat():
    return CategorieDepense.objects.filter(projektbudget=False, actif=True).first()


def _leitung(projet):
    user = User.objects.create_user(
        email=f"l{projet.pk}@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    projet.responsable = MembreFactory(user=user)
    projet.save()
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _plan(client, projet, kat, betrag):
    return client.post(
        reverse("projets:projet-plankosten-list"),
        {"projet": str(projet.id), "categorie": str(kat.id), "betrag": betrag},
        format="json",
    )


def test_planjahr_standard_aus_frist_sonst_erstellung():
    mit_frist = ProjetFactory(date_limite=datetime.date(JAHR, 3, 1))
    assert mit_frist.budget_jahr == JAHR
    assert ProjetFactory(plan_jahr=2031).budget_jahr == 2031
    assert ProjetFactory().budget_jahr == ProjetFactory().created_at.year


def test_plan_innerhalb_des_projekttopfs(kat):
    projet = ProjetFactory(plan_jahr=JAHR)
    c = _leitung(projet)
    assert _plan(c, projet, kat, "500").status_code == 201


def test_plan_ueberschreitet_projekttopf(kat):
    projet = ProjetFactory(plan_jahr=JAHR)
    c = _leitung(projet)
    r = _plan(c, projet, kat, "500.01")
    assert r.status_code == 400 and "Projektbudget" in r.data["message"]
    assert PlanKosten.objects.count() == 0


def test_summe_mehrerer_projekte_desselben_jahres(kat):
    p1, p2 = ProjetFactory(plan_jahr=JAHR), ProjetFactory(plan_jahr=JAHR)
    c2 = _leitung(p2)
    assert _plan(_leitung(p1), p1, kat, "300").status_code == 201
    assert _plan(c2, p2, kat, "250").status_code == 400
    assert _plan(c2, p2, kat, "200").status_code == 201


def test_projekte_anderer_jahre_zaehlen_nicht(kat):
    ProjetFactory(plan_jahr=JAHR + 1)
    p1 = ProjetFactory(plan_jahr=JAHR)
    anderes = ProjetFactory(plan_jahr=JAHR + 1)
    PlanKosten.objects.create(projet=anderes, categorie=kat, betrag=Decimal("400"))
    assert _plan(_leitung(p1), p1, kat, "500").status_code == 201


def test_abgesagte_projekte_zaehlen_nicht(kat):
    abgesagt = ProjetFactory(plan_jahr=JAHR, statut=StatutProjet.ANNULE)
    PlanKosten.objects.create(projet=abgesagt, categorie=kat, betrag=Decimal("450"))
    p = ProjetFactory(plan_jahr=JAHR)
    assert _plan(_leitung(p), p, kat, "500").status_code == 201


def test_aendern_eines_plans_rechnet_den_eigenen_betrag_heraus(kat):
    p = ProjetFactory(plan_jahr=JAHR)
    c = _leitung(p)
    plan_id = _plan(c, p, kat, "400").data["id"]
    detail = reverse("projets:projet-plankosten-detail", args=[plan_id])
    assert c.patch(detail, {"betrag": "500"}, format="json").status_code == 200
    assert c.patch(detail, {"betrag": "501"}, format="json").status_code == 400


def test_ohne_projektbudget_gesperrt(kat):
    p = ProjetFactory(plan_jahr=2033)
    BudgetAnnuel.objects.filter(annee=2033).delete()
    r = _plan(_leitung(p), p, kat, "1")
    assert r.status_code == 400


def test_planjahr_aendern_prueft_zieljahr(kat):
    p = ProjetFactory(plan_jahr=JAHR)
    c = _leitung(p)
    PlanKosten.objects.create(projet=p, categorie=kat, betrag=Decimal("300"))
    BudgetAnnuel.objects.filter(annee=2029, categorie__projektbudget=True).update(
        montant=Decimal("100")
    )
    url = reverse("projets:projet-planjahr", args=[p.id])
    assert c.post(url, {"plan_jahr": 2029}, format="json").status_code == 400
    ok = c.post(url, {"plan_jahr": 2030}, format="json")
    assert ok.status_code == 200 and ok.data["plan_jahr"] == 2030
    p.refresh_from_db()
    assert p.plan_jahr == 2030


def test_planjahr_nur_leitung_und_verwaltung():
    p = ProjetFactory(plan_jahr=JAHR)
    fremd = User.objects.create_user(
        email="fr@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    c = APIClient()
    c.force_authenticate(user=fremd)
    assert c.post(
        reverse("projets:projet-planjahr", args=[p.id]), {"plan_jahr": 2028}
    ).status_code in (403, 404)


def test_kosten_uebersicht_zeigt_projektbudget(kat):
    p = ProjetFactory(plan_jahr=JAHR)
    c = _leitung(p)
    _plan(c, p, kat, "120")
    daten = c.get(reverse("projets:projet-kosten-uebersicht", args=[p.id])).data
    assert daten["projektbudget"]["jahr"] == JAHR
    assert Decimal(daten["projektbudget"]["budget"]) == 500
    assert Decimal(daten["projektbudget"]["verfuegbar"]) == 380

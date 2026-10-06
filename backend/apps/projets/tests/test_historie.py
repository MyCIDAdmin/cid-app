"""Historische Projekte mit manuell erfasstem Beitrag (Nutzerwunsch 2026-10-06, Migration von
Altdaten) — Betrag zählt zu montant_collecte/nb_contributeurs, nur bei abgeschlossenem Projekt."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.projets.models import SichtbarkeitProjet, StatutProjet
from apps.projets.tests.factories import ProjetFactory
from apps.projets.tests.test_api import _auth, _user_avec_membre
from apps.stats.bilan import resultats_projets

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _payload(**extra):
    daten = {
        "titre": "Spendenaktion 2022",
        "statut": StatutProjet.TERMINE,
        "date_limite": "2022-12-31",
        "historisch_betrag": "1250.50",
        "historisch_beitragende": 18,
        "historisch_jahr": 2022,
    }
    daten.update(extra)
    return daten


def test_bureau_admin_legt_vergangenes_projekt_mit_betrag_an(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "hist1@example.de")
    resp = _auth(api_client, user).post(reverse("projets:projet-list"), _payload())
    assert resp.status_code == 201, resp.data
    assert resp.data["montant_collecte"] == "1250.50"
    assert resp.data["nb_contributeurs"] == 18
    assert resp.data["historisch_jahr"] == 2022


def test_betrag_nur_bei_abgeschlossenem_projekt(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "hist2@example.de")
    resp = _auth(api_client, user).post(
        reverse("projets:projet-list"), _payload(statut=StatutProjet.EN_COURS)
    )
    assert resp.status_code == 400
    assert "historisch_betrag" in resp.data["details"]


def test_negativer_betrag_wird_abgelehnt(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "hist3@example.de")
    resp = _auth(api_client, user).post(
        reverse("projets:projet-list"), _payload(historisch_betrag="-5.00")
    )
    assert resp.status_code == 400


def test_normales_mitglied_darf_historie_nicht_setzen(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "hist4@example.de")
    resp = _auth(api_client, user).post(reverse("projets:projet-list"), _payload())
    assert resp.status_code == 403


def test_kennzahlen_enthalten_historische_betraege(api_client):
    ProjetFactory(
        statut=StatutProjet.TERMINE,
        sichtbarkeit=SichtbarkeitProjet.VEROEFFENTLICHT,
        historisch_betrag=Decimal("300.00"),
        historisch_beitragende=7,
    )
    resp = api_client.get(reverse("projets:projet-kennzahlen"))
    assert resp.data["montant_collecte"] == Decimal("300.00")
    assert resp.data["nb_donateurs"] == 7


def test_jahresbilanz_ordnet_historischen_betrag_dem_historischen_jahr_zu():
    projekt = ProjetFactory(
        statut=StatutProjet.TERMINE, historisch_betrag=Decimal("400.00"), historisch_jahr=2021
    )
    assert [z["recettes"] for z in resultats_projets(2021) if z["id"] == str(projekt.id)] == [
        Decimal("400.00")
    ]
    assert not [z for z in resultats_projets(2022) if z["id"] == str(projekt.id)]

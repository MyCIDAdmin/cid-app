"""Tests — Fähigkeiten-Datenbank (Release 9): Katalog, „Wo kann ich helfen?“, Reporting."""

import io

import pytest
from django.urls import reverse
from openpyxl import load_workbook
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import Faehigkeit, MembreFaehigkeit, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

KATALOG = "membres:faehigkeit-liste"
MEINE = "membres:mes-faehigkeiten"
BERICHT = "membres:faehigkeiten-reporting"
EXPORT = "membres:faehigkeiten-reporting-export"


def _client(role=Role.MEMBRE, email="f@example.de", statut=StatutMembre.ACTIF):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, statut=statut)
    client = APIClient()
    client.force_authenticate(user)
    return client, membre


def test_standardkatalog_ist_vorbelegt():
    assert Faehigkeit.objects.filter(ist_standard=True).count() >= 30
    assert Faehigkeit.objects.filter(bezeichnung="Webdesign", kategorie="it_web").exists()


def test_katalog_ist_fuer_angemeldete_lesbar_und_nicht_fuer_anonyme():
    assert APIClient().get(reverse(KATALOG)).status_code in (401, 403)
    client, _ = _client()
    resp = client.get(reverse(KATALOG))
    assert resp.status_code == 200
    assert any(k["id"] == "weitere" for k in resp.data["kategorien"])


def test_mitglied_legt_eigene_faehigkeit_an_und_doppelte_werden_zusammengefuehrt():
    client, _ = _client()
    erste = client.post(reverse(KATALOG), {"bezeichnung": "  Drohnen   fliegen "}, format="json")
    assert erste.status_code == 201
    assert erste.data["bezeichnung"] == "Drohnen fliegen"
    assert erste.data["kategorie"] == "weitere" and erste.data["ist_standard"] is False
    zweite = client.post(reverse(KATALOG), {"bezeichnung": "DROHNEN fliegen"}, format="json")
    assert zweite.status_code == 200 and zweite.data["id"] == erste.data["id"]
    standard = client.post(reverse(KATALOG), {"bezeichnung": "webdesign"}, format="json")
    assert standard.status_code == 200 and standard.data["ist_standard"] is True


def test_meine_faehigkeiten_ersetzen_die_auswahl():
    client, membre = _client()
    web = Faehigkeit.objects.get(bezeichnung="Webdesign")
    logistik = Faehigkeit.objects.get(bezeichnung="Logistik")
    resp = client.put(
        reverse(MEINE),
        {
            "faehigkeiten": [
                {"faehigkeit": str(web.id), "kommentar": "5 Jahre Erfahrung"},
                {"faehigkeit": str(logistik.id)},
            ]
        },
        format="json",
    )
    assert resp.status_code == 200 and len(resp.data["faehigkeiten"]) == 2
    resp = client.put(
        reverse(MEINE), {"faehigkeiten": [{"faehigkeit": str(web.id)}]}, format="json"
    )
    assert [f["faehigkeit"] for f in resp.data["faehigkeiten"]] == [str(web.id)]
    assert MembreFaehigkeit.objects.filter(membre=membre).count() == 1
    assert client.get(reverse(MEINE)).data["faehigkeiten"][0]["faehigkeit"] == str(web.id)


def test_jeder_sieht_nur_seine_eigenen_faehigkeiten():
    client_a, _ = _client(email="a@example.de")
    client_b, _ = _client(email="b@example.de")
    web = Faehigkeit.objects.get(bezeichnung="Webdesign")
    client_a.put(reverse(MEINE), {"faehigkeiten": [{"faehigkeit": str(web.id)}]}, format="json")
    assert client_b.get(reverse(MEINE)).data["faehigkeiten"] == []


def test_reporting_nur_ab_rh_und_gruppiert_nach_faehigkeit():
    mitglied, _ = _client(email="m@example.de")
    web = Faehigkeit.objects.get(bezeichnung="Webdesign")
    mitglied.put(
        reverse(MEINE),
        {"faehigkeiten": [{"faehigkeit": str(web.id), "kommentar": "Figma"}]},
        format="json",
    )
    assert mitglied.get(reverse(BERICHT)).status_code == 403
    rh, _ = _client(role=Role.RH, email="rh@example.de")
    resp = rh.get(reverse(BERICHT))
    assert resp.status_code == 200
    assert resp.data["summen"]["mitglieder"] == 1
    zeile = resp.data["ergebnisse"][0]
    assert zeile["bezeichnung"] == "Webdesign" and zeile["anzahl"] == 1
    assert zeile["mitglieder"][0]["kommentar"] == "Figma"
    gefiltert = rh.get(reverse(BERICHT), {"kategorie": "organisation"})
    assert gefiltert.data["ergebnisse"] == []
    alle = rh.get(reverse(BERICHT), {"alle": "1", "kategorie": "organisation"})
    assert len(alle.data["ergebnisse"]) >= 5
    nach_status = rh.get(reverse(BERICHT), {"statut": "inactif"})
    assert nach_status.data["ergebnisse"] == []


def test_reporting_export_ist_excel_und_neutralisiert_formeln():
    client, _ = _client(email="x@example.de")
    eigene = client.post(reverse(KATALOG), {"bezeichnung": "=HYPERLINK(1)"}, format="json").data
    client.put(reverse(MEINE), {"faehigkeiten": [{"faehigkeit": eigene["id"]}]}, format="json")
    rh, _ = _client(role=Role.RH, email="rh2@example.de")
    resp = rh.get(reverse(EXPORT))
    assert resp.status_code == 200
    blatt = load_workbook(io.BytesIO(resp.content)).active
    assert blatt["B2"].value == "'=HYPERLINK(1)"


def test_loeschen_nur_ab_rh_und_nicht_fuer_standard():
    client, _ = _client(email="l@example.de")
    neu = client.post(reverse(KATALOG), {"bezeichnung": "Segeln"}, format="json").data
    url = reverse("membres:faehigkeit-loeschen", args=[neu["id"]])
    assert client.delete(url).status_code == 403
    rh, _ = _client(role=Role.RH, email="rh3@example.de")
    standard = Faehigkeit.objects.get(bezeichnung="Webdesign")
    assert rh.delete(reverse("membres:faehigkeit-loeschen", args=[standard.id])).status_code == 400
    assert rh.delete(url).status_code == 204
    assert not Faehigkeit.objects.filter(bezeichnung="Segeln").exists()


def test_mitglied_ohne_fiche_kann_nichts_eintragen():
    user = User.objects.create_user(
        email="ohne@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user)
    assert client.get(reverse(MEINE)).status_code == 400

"""Tests — Probelauf des Jahresabschlusses und Cockpit (rein lesend)."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.finances.models import (
    CategorieDepense,
    Depense,
    FinanzProtokoll,
    Gesamtbudget,
    Jahresabschluss,
    StatutDepense,
)

pytestmark = pytest.mark.django_db

JAHR = timezone.localdate().year


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def fin():
    return User.objects.create_user(
        email="fin@example.de", password="Password123!", role=Role.DIR_FINANCIER, is_active=True
    )


@pytest.fixture
def cat():
    return CategorieDepense.objects.first()


def _depense(cat, user, montant="50.00", statut=StatutDepense.EN_ATTENTE, monat=3):
    return Depense.objects.create(
        date_depense=datetime.date(JAHR, monat, 10),
        montant=Decimal(montant),
        categorie=cat,
        fournisseur="Lieferant",
        statut=statut,
        saisie_par=user,
    )


def _probelauf(api_client, **params):
    return api_client.get(reverse("finances:probelauf"), {"annee": JAHR, **params})


def _punkt(daten, punkt_id):
    return next(p for p in daten["pruefliste"] if p["id"] == punkt_id)


def test_probelauf_schreibt_nichts(api_client, fin, cat):
    _depense(cat, fin)
    api_client.force_authenticate(user=fin)
    vorher = (
        Jahresabschluss.objects.count(),
        FinanzProtokoll.objects.count(),
        Depense.objects.filter(statut=StatutDepense.EN_ATTENTE).count(),
    )
    r = _probelauf(api_client, offene_ausgaben="1", offene_beitraege="1")
    assert r.status_code == 200
    nachher = (
        Jahresabschluss.objects.count(),
        FinanzProtokoll.objects.count(),
        Depense.objects.filter(statut=StatutDepense.EN_ATTENTE).count(),
    )
    assert vorher == nachher
    assert not Jahresabschluss.objects.filter(annee=JAHR).exists()


def test_probelauf_nur_mit_finanzrecht(api_client):
    assert _probelauf(api_client).status_code in (401, 403)
    member = User.objects.create_user(
        email="m@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    api_client.force_authenticate(user=member)
    assert _probelauf(api_client).status_code == 403
    assert api_client.get(reverse("finances:cockpit")).status_code == 403


def test_offene_freigabe_ist_pflicht_und_ampel_rot(api_client, fin, cat):
    _depense(cat, fin, "80.00")
    api_client.force_authenticate(user=fin)
    d = _probelauf(api_client).data
    punkt = _punkt(d, "freigaben")
    assert punkt["stufe"] == "pflicht" and punkt["ok"] is False and punkt["anzahl"] == 1
    assert Decimal(str(punkt["betrag"])) == Decimal("80.00")
    assert d["bewertung"]["ampel"] == "rot"


def test_was_waere_wenn_rechnet_offene_ausgaben_ein(api_client, fin, cat):
    _depense(cat, fin, "30.00", StatutDepense.APPROUVEE)
    _depense(cat, fin, "80.00")
    api_client.force_authenticate(user=fin)
    ohne = _probelauf(api_client).data
    mit = _probelauf(api_client, offene_ausgaben="true").data
    assert Decimal(str(ohne["ausgaben"]["total"])) == Decimal("30.00")
    assert Decimal(str(mit["ausgaben"]["total"])) == Decimal("110.00")
    assert Decimal(str(mit["ergebnis"])) == Decimal(str(ohne["ergebnis"])) - Decimal("80.00")
    zeile = next(k for k in mit["kostenarten"] if k["categorie_id"] == str(cat.id))
    assert Decimal(str(zeile["montant"])) == Decimal("110.00")
    assert mit["annahmen"] == {"offene_ausgaben": True, "offene_beitraege": False}


def test_ohne_beleg_ist_empfehlung_ampel_orange(api_client, fin, cat):
    Gesamtbudget.objects.create(annee=JAHR, montant=Decimal("1000"))
    _depense(cat, fin, "40.00", StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=fin)
    d = _probelauf(api_client).data
    assert _punkt(d, "belege")["anzahl"] == 1
    assert _punkt(d, "freigaben")["ok"] is True
    assert d["bewertung"]["ampel"] == "orange"
    assert d["bewertung"]["bereit_prozent"] < 100


def test_leeres_jahr_mit_budget_ist_gruen(api_client, fin):
    Gesamtbudget.objects.create(annee=JAHR, montant=Decimal("1000"))
    api_client.force_authenticate(user=fin)
    d = _probelauf(api_client).data
    assert d["bewertung"]["ampel"] == "gruen" and d["bewertung"]["bereit_prozent"] == 100
    codes = [h["code"] for h in d["bewertung"]["hinweise"]]
    assert "ergebnis" in codes and "pruefliste" in codes


def test_fehlendes_gesamtbudget_ist_hinweis(api_client, fin):
    api_client.force_authenticate(user=fin)
    d = _probelauf(api_client).data
    assert _punkt(d, "budget_gesetzt")["ok"] is False


def test_ueber_budget_wird_gemeldet(api_client, fin, cat):
    from apps.finances.models import BudgetAnnuel

    Gesamtbudget.objects.create(annee=JAHR, montant=Decimal("1000"))
    BudgetAnnuel.objects.create(annee=JAHR, categorie=cat, montant=Decimal("100"))
    _depense(cat, fin, "150.00", StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=fin)
    d = _probelauf(api_client).data
    zeile = next(k for k in d["kostenarten"] if k["categorie_id"] == str(cat.id))
    assert zeile["status"] == "depasse" and zeile["prozent"] == 150.0
    codes = {h["code"]: h for h in d["bewertung"]["hinweise"]}
    assert codes["ueber_budget"]["params"]["anzahl"] == 1


def test_cockpit_leitet_aufgaben_aus_dem_stand_ab(api_client, fin, cat):
    _depense(cat, fin, "80.00")
    api_client.force_authenticate(user=fin)
    r = api_client.get(reverse("finances:cockpit"))
    assert r.status_code == 200
    codes = [a["code"] for a in r.data["aufgaben"]]
    assert "freigaben" in codes
    assert r.data["freigaben"]["anzahl"] == 1
    assert set(r.data["prognose"]) >= {"bisher", "kumuliert", "jahresende", "budget"}
    assert all("faellig" in a and a["rollen"] for a in r.data["aufgaben"])


def test_cockpit_ohne_offene_punkte_keine_freigabe_aufgabe(api_client, fin):
    api_client.force_authenticate(user=fin)
    r = api_client.get(reverse("finances:cockpit"))
    assert "freigaben" not in [a["code"] for a in r.data["aufgaben"]]


def test_prognose_hochrechnung_aus_den_letzten_monaten(fin, cat):
    from apps.finances.probelauf import cockpit

    for monat in (1, 2, 3):
        _depense(cat, fin, "100.00", StatutDepense.APPROUVEE, monat=monat)
    daten = cockpit(heute=datetime.date(JAHR, 4, 15))
    assert Decimal(str(daten["prognose"]["bisher"])) == Decimal("300.00")
    assert Decimal(str(daten["prognose"]["monatsschnitt"])) == Decimal("100.00")
    # 300 bisher + 8 volle Restmonate (Mai bis Dezember) + Rest des laufenden Monats (100).
    assert Decimal(str(daten["prognose"]["jahresende"])) == Decimal("1200.00")


def test_abschluss_speichert_begruendungen_im_snapshot(api_client, fin, cat):
    _depense(cat, fin, "40.00", StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=fin)
    r = api_client.post(
        reverse("finances:abschluss"),
        {"annee": JAHR, "begruendungen": {str(cat.id): "  Mehr Catering  ", "x": ""}},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["snapshot"]["begruendungen"] == {str(cat.id): "Mehr Catering"}


@pytest.mark.parametrize(
    "wert", ["text", ["a"], {"k": 5}, {"k": "x" * 501}, {str(i): "a" for i in range(31)}]
)
def test_abschluss_lehnt_ungueltige_begruendungen_ab(api_client, fin, wert):
    api_client.force_authenticate(user=fin)
    r = api_client.post(
        reverse("finances:abschluss"), {"annee": JAHR, "begruendungen": wert}, format="json"
    )
    assert r.status_code == 400
    assert not Jahresabschluss.objects.filter(annee=JAHR).exists()

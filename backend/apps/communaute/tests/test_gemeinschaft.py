"""Tests — Startseite nach der Anmeldung : Zahlen zum Verein und „Neu dabei“ (nur mit Zustimmung)."""

from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute import gemeinschaft
from apps.membres.models import Bundesland, StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.regionen.models import Region, RegionLand

pytestmark = pytest.mark.django_db

URL = "communaute:gemeinschaft"


def _user(email, role=Role.MEMBRE, praeferenzen=None, **membre_kwargs):
    user = User.objects.create_user(
        email=email,
        password="Password123!",
        role=role,
        is_active=True,
        ui_praeferenzen=praeferenzen or {},
    )
    return user, MembreFactory(user=user, **membre_kwargs)


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def test_zahlen_zaehlen_nur_aktive_mitglieder():
    MembreFactory(ville_de="Berlin", land_de=Bundesland.BERLIN)
    MembreFactory(ville_de=" berlin ", land_de=Bundesland.BERLIN)
    MembreFactory(ville_de="Köln", land_de=Bundesland.NORDRHEIN_WESTFALEN)
    MembreFactory(
        ville_de="Hamburg", land_de=Bundesland.HAMBURG, statut=StatutMembre.INACTIF
    )
    MembreFactory(ville_de="Bremen", land_de="", statut=StatutMembre.EN_ATTENTE)

    z = gemeinschaft.zahlen(heute=date(2026, 11, 15))

    assert z["mitglieder"] == 3
    assert z["bundeslaender"] == 2
    assert z["staedte"] == 2  # Berlin (Schreibweise egal) und Köln
    assert z["monat"] == "2026-11"


def test_neu_im_monat_zaehlt_ab_dem_ersten():
    MembreFactory(date_adhesion=date(2026, 10, 31))
    MembreFactory(date_adhesion=date(2026, 11, 1))
    MembreFactory(date_adhesion=date(2026, 11, 9))

    assert gemeinschaft.zahlen(heute=date(2026, 11, 15))["neu_im_monat"] == 2


def test_neu_dabei_nur_mit_zustimmung_und_nur_neue_mitglieder():
    heute = timezone.localdate()
    betrachter, _ = _user("b@example.com")
    _user(
        "ja@example.com",
        praeferenzen={"neu_dabei_zeigen": True},
        prenom="Amine",
        nom="Khaled",
        date_adhesion=heute - timedelta(days=5),
    )
    _user(
        "nein@example.com",
        praeferenzen={"neu_dabei_zeigen": False},
        prenom="Sonia",
        nom="Ben",
        date_adhesion=heute - timedelta(days=5),
    )
    _user(
        "leer@example.com",
        prenom="Leila",
        nom="Hadj",
        date_adhesion=heute - timedelta(days=5),
    )
    _user(
        "alt@example.com",
        praeferenzen={"neu_dabei_zeigen": True},
        prenom="Yassine",
        nom="Mrad",
        date_adhesion=heute - timedelta(days=gemeinschaft.NEU_DABEI_TAGE + 10),
    )

    liste = gemeinschaft.neu_dabei(betrachter)

    assert [(e["vorname"], e["initial"]) for e in liste] == [("Amine", "K.")]


def test_neu_dabei_enthaelt_sektor_und_hoechstens_sechs_eintraege():
    region, _ = Region.objects.get_or_create(name="NRW", defaults={"slug": "nrw"})
    RegionLand.objects.update_or_create(
        land=Bundesland.NORDRHEIN_WESTFALEN, defaults={"region": region}
    )
    betrachter, _ = _user("b@example.com")
    for i in range(8):
        _user(
            f"n{i}@example.com",
            praeferenzen={"neu_dabei_zeigen": True},
            prenom=f"Name{i}",
            nom="Test",
            land_de=Bundesland.NORDRHEIN_WESTFALEN,
            date_adhesion=timezone.localdate() - timedelta(days=i),
        )

    liste = gemeinschaft.neu_dabei(betrachter)

    assert len(liste) == gemeinschaft.NEU_DABEI_MAX
    assert {e["sektor"] for e in liste} == {"NRW"}
    assert liste[0]["vorname"] == "Name0"  # neuester zuerst


def test_neu_dabei_nicht_fuer_fan_konten_und_nicht_fuer_inaktive():
    _user(
        "ja@example.com",
        praeferenzen={"neu_dabei_zeigen": True},
        prenom="Amine",
        nom="Khaled",
        date_adhesion=timezone.localdate(),
    )
    fan = User.objects.create_user(
        email="fan@example.com",
        password="Password123!",
        role=Role.MEMBRE,
        is_active=True,
    )
    inaktiv, _ = _user("i@example.com", statut=StatutMembre.EN_ATTENTE)

    assert gemeinschaft.neu_dabei(fan) == []
    assert gemeinschaft.neu_dabei(inaktiv) == []


def test_neu_dabei_fuer_das_buero_sichtbar():
    _user(
        "ja@example.com",
        praeferenzen={"neu_dabei_zeigen": True},
        prenom="Amine",
        nom="Khaled",
        date_adhesion=timezone.localdate(),
    )
    buero = User.objects.create_user(
        email="rh@example.com", password="Password123!", role=Role.RH, is_active=True
    )

    assert len(gemeinschaft.neu_dabei(buero)) == 1


def test_api_liefert_zahlen_und_liste():
    nutzer, _ = _user("b@example.com")
    _user(
        "ja@example.com",
        praeferenzen={"neu_dabei_zeigen": True},
        prenom="Amine",
        nom="Khaled",
        date_adhesion=timezone.localdate(),
    )

    antwort = _client(nutzer).get(reverse(URL))

    assert antwort.status_code == 200
    assert antwort.data["mitglieder"] == 2
    assert set(antwort.data) == {
        "mitglieder",
        "bundeslaender",
        "staedte",
        "neu_im_monat",
        "monat",
        "neu_dabei",
    }
    assert antwort.data["neu_dabei"][0]["vorname"] == "Amine"
    assert "email" not in antwort.data["neu_dabei"][0]


def test_api_verlangt_anmeldung():
    assert APIClient().get(reverse(URL)).status_code == 401


def test_einstellung_wird_gespeichert_und_nur_bool_akzeptiert():
    nutzer, _ = _user("b@example.com")
    c = _client(nutzer)

    ok = c.patch(
        reverse("accounts:me"),
        {"ui_praeferenzen": {"neu_dabei_zeigen": True}},
        format="json",
    )
    schlecht = c.patch(
        reverse("accounts:me"),
        {"ui_praeferenzen": {"neu_dabei_zeigen": "ja"}},
        format="json",
    )

    assert ok.status_code == 200
    assert ok.data["ui_praeferenzen"]["neu_dabei_zeigen"] is True
    assert schlecht.status_code == 400

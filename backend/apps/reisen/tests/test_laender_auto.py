"""Ländersteckbriefe automatisch erzeugen: Erkennung, Berechnung, Anlage beim ersten Bedarf."""

from datetime import date

import pytest

from apps.accounts.models import Role
from apps.reisen import laender_auto
from apps.reisen.models import Laenderprofil

from .test_reisen import BASE, api, dabei, neue_reise, offen, user

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "eingabe, iso",
    [
        ("Tunesien", "TN"),
        ("tunisia", "TN"),
        ("Tunisie", "TN"),
        ("Ägypten", "EG"),
        ("Aegypten", "EG"),
        ("Egypt", "EG"),
        ("Türkei", "TR"),
        ("Tuerkei", "TR"),
        ("England", "GB"),
        ("USA", "US"),
        ("Elfenbeinküste", "CI"),
        ("  Frankreich ", "FR"),
        ("Allemagne", "DE"),
    ],
)
def test_land_wird_in_drei_sprachen_erkannt(eingabe, iso):
    assert laender_auto.finde_iso(eingabe) == iso


def test_unbekanntes_land_bleibt_ohne_treffer():
    assert laender_auto.finde_iso("Atlantis") is None
    assert laender_auto.finde_iso("") is None


def test_auto_daten_fuer_tunesien():
    winter = laender_auto.auto_daten("TN", date(2026, 12, 1))
    assert winter["waehrung"]["code"] == "TND"
    assert winter["waehrung"]["name"]["de"] == "Tunesischer Dinar"
    assert winter["steckdose"] == {"typen": "C, E", "spannung": "230 V", "frequenz": "50 Hz"}
    assert winter["amtliche_hinweise_url"].endswith("/tunesien-node")
    assert winter["zeitverschiebung"] == {"stunden": 0, "mehrere": False}
    # Tunesien kennt keine Sommerzeit : im deutschen Sommer ist es eine Stunde früher.
    sommer = laender_auto.auto_daten("TN", date(2027, 7, 1))
    assert sommer["zeitverschiebung"] == {"stunden": -1, "mehrere": False}


def test_mehrere_zeitzonen_werden_als_solche_gemeldet():
    assert laender_auto.auto_daten("US", date(2026, 12, 1))["zeitverschiebung"]["mehrere"] is True


def test_land_ohne_aa_seite_verweist_auf_die_uebersicht():
    daten = laender_auto.auto_daten("GU")
    assert daten["amtliche_hinweise_url"] == laender_auto.AA_BASIS


def test_steckbrief_entsteht_beim_ersten_bedarf_und_nur_einmal():
    orga, anna = user("orga@example.de"), user("anna@example.de")
    rid = neue_reise(orga, **offen(land="Tunesien"))
    dabei(rid, anna)
    assert not Laenderprofil.objects.exists()
    erste = api(anna).get(f"{BASE}{rid}/").data["laenderprofil"]
    zweite = api(anna).get(f"{BASE}{rid}/").data["laenderprofil"]
    assert Laenderprofil.objects.count() == 1
    assert erste["id"] == zweite["id"]
    assert erste["land"] == "Tunesien" and erste["iso"] == "TN"
    assert erste["hat_ergaenzungen"] is False
    assert erste["waehrung"] == "" and erste["auto"]["waehrung"]["code"] == "TND"


def test_land_in_anderer_sprache_findet_denselben_steckbrief():
    orga, anna = user("orga@example.de"), user("anna@example.de")
    erste = neue_reise(orga, **offen(land="Tunesien"))
    dabei(erste, anna)
    api(anna).get(f"{BASE}{erste}/")
    zweite = neue_reise(orga, titel="Tunis", **offen(land="Tunisia"))
    dabei(zweite, anna)
    api(anna).get(f"{BASE}{zweite}/")
    assert Laenderprofil.objects.count() == 1


def test_unbekanntes_land_ergibt_keinen_steckbrief():
    orga, anna = user("orga@example.de"), user("anna@example.de")
    rid = neue_reise(orga, **offen(land="Atlantis"))
    dabei(rid, anna)
    assert api(anna).get(f"{BASE}{rid}/").data["laenderprofil"] is None
    assert not Laenderprofil.objects.exists()


def test_ergaenzungen_des_bureau_bleiben_neben_dem_automatischen_teil_bestehen():
    orga, anna = user("orga@example.de"), user("anna@example.de")
    admin = user("admin@example.de", role=Role.BUREAU_ADMIN)
    rid = neue_reise(orga, **offen(land="Tunesien"))
    dabei(rid, anna)
    profil = api(anna).get(f"{BASE}{rid}/").data["laenderprofil"]
    antwort = api(admin).patch(
        f"{BASE}laenderprofile/{profil['id']}/",
        {"einreise": "<p>Reisepass genügt</p>", "steckdose": "Adapter Typ E mitnehmen"},
        format="json",
    )
    assert antwort.status_code == 200
    # Auch nach einem weiteren Abruf (und dem täglichen Abgleich) bleibt alles erhalten.
    laender_auto.ergaenze_alle()
    spaeter = api(anna).get(f"{BASE}{rid}/").data["laenderprofil"]
    assert spaeter["einreise"] == "<p>Reisepass genügt</p>"
    assert spaeter["steckdose"] == "Adapter Typ E mitnehmen"
    assert spaeter["hat_ergaenzungen"] is True
    assert spaeter["auto"]["steckdose"]["typen"] == "C, E"


def test_manuell_angelegter_steckbrief_bekommt_den_automatischen_teil():
    admin = user("admin@example.de", role=Role.BUREAU_ADMIN)
    antwort = api(admin).post(f"{BASE}laenderprofile/", {"land": "Marokko"}, format="json")
    assert antwort.status_code == 201
    assert antwort.data["iso"] == "MA" and antwort.data["auto"]["waehrung"]["code"] == "MAD"


def test_taeglicher_abgleich_legt_fehlende_steckbriefe_an_und_ist_idempotent():
    orga = user("orga@example.de")
    neue_reise(orga, **offen(land="Frankreich"))
    neue_reise(orga, titel="Zwei", **offen(land="Atlantis"))
    assert laender_auto.ergaenze_alle() == 1
    assert laender_auto.ergaenze_alle() == 0
    assert list(Laenderprofil.objects.values_list("iso_code", flat=True)) == ["FR"]

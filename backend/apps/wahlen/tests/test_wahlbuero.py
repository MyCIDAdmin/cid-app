"""Wahlbüro: Beteiligung, Stimmzettel-Vorschau, Reglement-Bibliothek, Übergabe (Welle 2b)."""

from unittest import mock

import pytest

from apps.vote.models import ParticipationVote
from apps.wahlen import services
from apps.wahlen.models import Reglement
from apps.wahlen.tests.factories import mitglied, neue_wahl
from apps.wahlen.tests.test_api import BASIS, als
from apps.wahlen.tests.test_ergebnis import freigeben, geoeffnet, schliessen, stimmen

pytestmark = pytest.mark.django_db


# ------------------------------------------------------------------ Beteiligung


def test_beteiligung_zeigt_wer_abgestimmt_hat_aber_nie_wann_oder_was():
    wahl, ausschuss, _k = geoeffnet()
    waehler, membre = mitglied()
    ParticipationVote.objects.create(session=wahl.vote_session, membre=membre)
    antwort = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/beteiligung/")
    assert antwort.status_code == 200
    eintrag = next(e for e in antwort.data["eintraege"] if e["membre"] == str(membre.id))
    assert eintrag["hat_gewaehlt"] is True
    assert set(eintrag) == {"membre", "name", "hat_gewaehlt"}
    assert antwort.data["abgegeben"] == 1 and antwort.data["berechtigt"] >= 1


def test_beteiligung_nur_fuer_ausschuss_und_buero():
    wahl, ausschuss, _k = geoeffnet()
    fremd = als(mitglied()[0])
    assert fremd.get(f"{BASIS}{wahl.id}/beteiligung/").status_code == 403
    assert fremd.get(f"{BASIS}{wahl.id}/beteiligung/export/").status_code == 403


def test_beteiligung_vor_dem_oeffnen_nicht_moeglich():
    wahl, ausschuss = neue_wahl("person")
    assert als(ausschuss[0]).get(f"{BASIS}{wahl.id}/beteiligung/").status_code == 400


def test_beteiligung_export_als_csv():
    wahl, ausschuss, _k = geoeffnet()
    _user, membre = mitglied()
    membre.prenom = "=HYPERLINK"
    membre.save()
    antwort = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/beteiligung/export/")
    assert antwort.status_code == 200 and antwort["Content-Type"].startswith("text/csv")
    text = antwort.content.decode("utf-8-sig")
    assert text.startswith("Name;Hat abgestimmt")
    assert (
        ";=" not in text and "\n=" not in text and "'=HYPERLINK" in text
    )  # Formel-Einschleusung entschärft


def test_eigene_teilnahme_in_der_wahl():
    wahl, _a, _k = geoeffnet()
    user, membre = mitglied()
    antwort = als(user).get(f"{BASIS}{wahl.id}/")
    assert antwort.data["teilnahme"] == {"wahlberechtigt": True, "hat_gewaehlt": False}
    ParticipationVote.objects.create(session=wahl.vote_session, membre=membre)
    antwort = als(user).get(f"{BASIS}{wahl.id}/")
    assert antwort.data["teilnahme"]["hat_gewaehlt"] is True


# ------------------------------------------------------------------ Stimmzettel


def test_wahlzettel_vorschau_vor_und_nach_dem_oeffnen():
    wahl, ausschuss = neue_wahl("person")
    from apps.wahlen.tests.test_ergebnis import zugelassene

    zugelassene(wahl, 2)
    antwort = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/wahlzettel/")
    assert antwort.status_code == 200
    assert antwort.data["geoeffnet"] is False and len(antwort.data["optionen"]) == 2
    # Mitglieder sehen ihn erst ab der Kampagne oder wenn die Wahl läuft
    assert als(mitglied()[0]).get(f"{BASIS}{wahl.id}/wahlzettel/").status_code == 403
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay"):
        services.oeffnen(wahl, ausschuss[0])
    wahl.refresh_from_db()
    antwort = als(mitglied()[0]).get(f"{BASIS}{wahl.id}/wahlzettel/")
    assert antwort.status_code == 200 and antwort.data["geoeffnet"] is True


# ------------------------------------------------------------------ Reglement


def anlegen(client, wahl, schluessel="wahlordnung"):
    return client.post(
        f"{BASIS}reglemente/", {"wahl": str(wahl.id), "schluessel": schluessel}, format="json"
    )


def test_reglement_ablauf_lesen_und_neue_version():
    wahl, ausschuss = neue_wahl("person")
    ausschuss_client = als(ausschuss[0])
    antwort = anlegen(ausschuss_client, wahl)
    assert antwort.status_code == 201
    rid = antwort.data["id"]
    assert anlegen(ausschuss_client, wahl).status_code == 400  # nur einmal je Dokument

    nutzer, _ = mitglied()
    mitglied_client = als(nutzer)
    # Ohne Text ist das Dokument für Mitglieder noch unsichtbar
    assert mitglied_client.get(f"{BASIS}reglemente/?wahl={wahl.id}").data == []

    antwort = ausschuss_client.patch(
        f"{BASIS}reglemente/{rid}/",
        {"sprache": "de", "html": "<h2>Art. 1</h2><p>Text</p><script>x()</script>", "version": "3"},
        format="json",
    )
    assert antwort.status_code == 200 and "script" not in antwort.data["texte"]["de"]

    liste = mitglied_client.get(f"{BASIS}reglemente/?wahl={wahl.id}").data
    assert len(liste) == 1 and liste[0]["gelesen"] is False and "gelesen_anzahl" not in liste[0]
    assert mitglied_client.post(f"{BASIS}reglemente/{rid}/gelesen/").data["gelesen"] is True
    # Neue Fassung: die Bestätigung gilt nur für die alte Version
    ausschuss_client.patch(
        f"{BASIS}reglemente/{rid}/",
        {"sprache": "de", "html": "<p>Neu</p>", "version": "4"},
        format="json",
    )
    assert mitglied_client.get(f"{BASIS}reglemente/?wahl={wahl.id}").data[0]["gelesen"] is False
    stand = ausschuss_client.get(f"{BASIS}reglemente/?wahl={wahl.id}").data[0]
    assert stand["gelesen_anzahl"] == 0 and stand["version"] == "4"


def test_reglement_nur_ausschuss_und_buero_schreiben():
    wahl, ausschuss = neue_wahl("person")
    fremd = als(mitglied()[0])
    assert anlegen(fremd, wahl).status_code == 403
    rid = anlegen(als(ausschuss[0]), wahl).data["id"]
    assert (
        fremd.patch(
            f"{BASIS}reglemente/{rid}/", {"sprache": "de", "html": "<p>x</p>"}, format="json"
        ).status_code
        == 403
    )
    assert (
        fremd.post(
            f"{BASIS}reglemente/{rid}/uebersetzen/", {"sprache": "fr"}, format="json"
        ).status_code
        == 403
    )


def test_reglement_entwurf_wahl_ist_fuer_mitglieder_nicht_sichtbar():
    wahl, ausschuss = neue_wahl("person", aktiv=False)
    rid = anlegen(als(ausschuss[0]), wahl).data["id"]
    fremd = als(mitglied()[0])
    assert fremd.get(f"{BASIS}reglemente/?wahl={wahl.id}").status_code == 403
    assert fremd.post(f"{BASIS}reglemente/{rid}/gelesen/").status_code == 403


def test_reglement_uebersetzung_und_pruefhaken():
    wahl, ausschuss = neue_wahl("person")
    client = als(ausschuss[0])
    rid = anlegen(client, wahl).data["id"]
    client.patch(
        f"{BASIS}reglemente/{rid}/", {"sprache": "de", "html": "<p>Art. 1</p>"}, format="json"
    )
    with mock.patch("apps.uebersetzung.deepl.ist_aktiv", return_value=True), mock.patch(
        "apps.uebersetzung.deepl.uebersetzen", return_value=("<p>Article 1</p>", "de")
    ):
        antwort = client.post(
            f"{BASIS}reglemente/{rid}/uebersetzen/", {"sprache": "fr"}, format="json"
        )
    assert antwort.status_code == 200 and antwort.data["texte"]["fr"] == "<p>Article 1</p>"
    assert antwort.data["geprueft"]["fr"] is False
    antwort = client.post(
        f"{BASIS}reglemente/{rid}/geprueft/", {"sprache": "fr", "wert": True}, format="json"
    )
    assert antwort.data["geprueft"]["fr"] is True
    # Ändert sich der deutsche Text, gilt die Übersetzung wieder als ungeprüft
    antwort = client.patch(
        f"{BASIS}reglemente/{rid}/", {"sprache": "de", "html": "<p>Art. 1a</p>"}, format="json"
    )
    assert antwort.data["geprueft"]["fr"] is False
    assert Reglement.objects.count() == 1


# ------------------------------------------------------------------ Übergabe


def test_uebergabe_checkliste():
    wahl, ausschuss, _k = geoeffnet()
    client = als(ausschuss[0])
    # Vor der Veröffentlichung des Ergebnisses kann nichts abgehakt werden
    assert (
        client.post(
            f"{BASIS}{wahl.id}/uebergabe/zugaenge_uebergeben/", {"erledigt": True}, format="json"
        ).status_code
        == 400
    )
    stimmen(wahl, {"Person 0": 2})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    stand = {p["schluessel"]: p for p in client.get(f"{BASIS}{wahl.id}/uebergabe/").data}
    assert stand["ergebnis_veroeffentlicht"]["erledigt"] is True
    assert stand["protokoll_unterschrieben"]["erledigt"] is False
    assert stand["zugaenge_uebergeben"]["erledigt"] is False
    # Automatische Punkte lassen sich nicht von Hand setzen
    assert (
        client.post(
            f"{BASIS}{wahl.id}/uebergabe/protokoll_unterschrieben/",
            {"erledigt": True},
            format="json",
        ).status_code
        == 400
    )
    antwort = client.post(
        f"{BASIS}{wahl.id}/uebergabe/zugaenge_uebergeben/",
        {"erledigt": True, "notiz": "Per Brief"},
        format="json",
    )
    stand = {p["schluessel"]: p for p in antwort.data}
    assert (
        stand["zugaenge_uebergeben"]["erledigt"] is True
        and stand["zugaenge_uebergeben"]["notiz"] == "Per Brief"
    )
    # Drei Unterschriften erfüllen den automatischen Punkt
    for user in ausschuss:
        als(user).post(f"{BASIS}{wahl.id}/protokoll/unterschreiben/")
    stand = {p["schluessel"]: p for p in client.get(f"{BASIS}{wahl.id}/uebergabe/").data}
    assert stand["protokoll_unterschrieben"]["erledigt"] is True


def test_uebergabe_nur_fuer_ausschuss_und_buero():
    wahl, _a, _k = geoeffnet()
    fremd = als(mitglied()[0])
    assert fremd.get(f"{BASIS}{wahl.id}/uebergabe/").status_code == 403
    assert (
        fremd.post(
            f"{BASIS}{wahl.id}/uebergabe/zugaenge_uebergeben/", {"erledigt": True}, format="json"
        ).status_code
        == 403
    )

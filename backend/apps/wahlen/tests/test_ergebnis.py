"""Ergebnis-Freigabe, Protokoll und Einsprüche (Welle 2a)."""

import hashlib
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.vote.models import ChoixExprime, VoteExprime
from apps.vote.tasks import clore_sessions_expirees, envoyer_notification_resultats
from apps.wahlen import services
from apps.wahlen.models import (
    Einspruch,
    EinspruchStatus,
    KandidatPerson,
    Kandidatur,
    KandidaturStatus,
)
from apps.wahlen.tests.factories import mitglied, neue_wahl
from apps.wahlen.tests.test_api import BASIS, als

pytestmark = pytest.mark.django_db


def zugelassene(wahl, anzahl=2):
    liste = []
    for i in range(anzahl):
        _user, membre = mitglied()
        membre.prenom, membre.nom = "Person", str(i)
        membre.save()
        k = Kandidatur.objects.create(
            wahl=wahl,
            einreicher=membre,
            name=f"Person {i}",
            status=KandidaturStatus.ZUGELASSEN,
            entschieden_am=timezone.now(),
        )
        KandidatPerson.objects.create(kandidatur=k, membre=membre)
        liste.append(k)
    return liste


def geoeffnet(form="person", anzahl=2, **extra):
    wahl, ausschuss = neue_wahl(form, **extra)
    k = zugelassene(wahl, anzahl)
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay"):
        services.oeffnen(wahl, ausschuss[0])
    wahl.refresh_from_db()
    return wahl, ausschuss, k


def stimmen(wahl, verteilung):
    """verteilung: {Optionsname: Anzahl}"""
    session = wahl.vote_session
    n = 0
    for label, anzahl in verteilung.items():
        option = session.options.get(label=label)
        for _ in range(anzahl):
            n += 1
            b = VoteExprime.objects.create(
                session=session, voter_token_hash=hashlib.sha256(str(n).encode()).hexdigest()
            )
            ChoixExprime.objects.create(bulletin=b, option=option)


def schliessen(wahl):
    session = wahl.vote_session
    session.statut = "cloturee"
    session.date_cloture = timezone.now()
    session.save()
    wahl.refresh_from_db()


def freigeben(wahl, ausschuss, art="ergebnis", wer=2):
    with mock.patch("apps.vote.tasks.envoyer_notification_resultats.delay"):
        with mock.patch("apps.vote.views.VoteSessionViewSet._broadcast_resultats"):
            for user in ausschuss[:wer]:
                antwort = als(user).post(f"{BASIS}{wahl.id}/freigabe/", {"art": art}, format="json")
    wahl.refresh_from_db()
    return antwort


# ------------------------------------------------------------------ Sperre des Ergebnisses


def test_ergebnis_bleibt_nach_dem_ende_zu_bis_zur_freigabe():
    wahl, ausschuss, (k1, k2) = geoeffnet()
    stimmen(wahl, {"Person 0": 3, "Person 1": 1})
    schliessen(wahl)
    session = wahl.vote_session
    assert session.ergebnis_gesperrt and not session.resultats_visibles
    # Modul Abstimmungen: keine Auswertung, keine Benachrichtigung
    assert envoyer_notification_resultats(str(session.id)) == 0
    mitglied_client = als(mitglied()[0])
    assert mitglied_client.get(f"/api/v1/votes/{session.id}/resultats/").status_code in (403, 404)
    # Wahlen-API: Mitglied sieht nichts, Ausschuss nur die Beteiligung
    antwort = mitglied_client.get(f"{BASIS}{wahl.id}/ergebnis/")
    assert antwort.data == {"freigegeben": False, "beendet": True}
    antwort = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/ergebnis/")
    assert antwort.data["freigegeben"] is False and antwort.data["beteiligung"]["abgegeben"] == 4
    assert "optionen" not in antwort.data


def test_automatische_schliessung_sendet_nichts_an_den_websocket():
    wahl, _a, _k = geoeffnet()
    session = wahl.vote_session
    session.date_fin = timezone.now() - timedelta(minutes=1)
    session.save()
    layer = mock.Mock()
    layer.group_send = mock.AsyncMock()
    with mock.patch("channels.layers.get_channel_layer", return_value=layer):
        with mock.patch("apps.vote.tasks.envoyer_notification_resultats.delay"):
            assert clore_sessions_expirees() == 1
    layer.group_send.assert_not_called()


def test_freigabe_braucht_zwei_und_beendete_wahl():
    wahl, ausschuss, _k = geoeffnet()
    # Vor dem Ende geht die Freigabe nicht
    assert (
        als(ausschuss[0])
        .post(f"{BASIS}{wahl.id}/freigabe/", {"art": "ergebnis"}, format="json")
        .status_code
        == 400
    )
    stimmen(wahl, {"Person 0": 2, "Person 1": 1})
    schliessen(wahl)
    antwort = freigeben(wahl, ausschuss, wer=1)
    assert antwort.data["ausgefuehrt"] is False and wahl.ergebnis_freigegeben_am is None
    antwort = freigeben(wahl, ausschuss, wer=2)  # zweite Stimme (erste ist idempotent)
    assert antwort.data["ausgefuehrt"] is True and wahl.ergebnis_freigegeben_am is not None
    assert wahl.status == "abgeschlossen"
    assert not wahl.vote_session.ergebnis_gesperrt
    # Nicht-Ausschuss darf nicht freigeben
    fremd = als(mitglied()[0])
    assert (
        fremd.post(f"{BASIS}{wahl.id}/freigabe/", {"art": "ergebnis"}, format="json").status_code
        == 403
    )


def test_ergebnis_nach_freigabe_fuer_mitglieder_sichtbar():
    wahl, ausschuss, (k1, _k2) = geoeffnet()
    stimmen(wahl, {"Person 0": 3, "Person 1": 1})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    antwort = als(mitglied()[0]).get(f"{BASIS}{wahl.id}/ergebnis/")
    assert antwort.status_code == 200 and antwort.data["freigegeben"] is True
    assert antwort.data["ausgang"] == "gewaehlt" and antwort.data["gewaehlt"] == ["Person 0"]
    assert antwort.data["beteiligung"]["abgegeben"] == 4
    assert antwort.data["optionen"][0]["stimmen"] == 3


# ------------------------------------------------------------------ Auswertung


def test_gleichstand_fuehrt_zur_stichwahl():
    wahl, ausschuss, _k = geoeffnet()
    stimmen(wahl, {"Person 0": 2, "Person 1": 2})
    schliessen(wahl)
    erg = services.ergebnis_auswerten(wahl)
    assert erg["ausgang"] == "stichwahl"
    assert sorted(erg["stichwahl_zwischen"]) == ["Person 0", "Person 1"]


def test_absolute_mehrheit_nicht_erreicht_ist_stichwahl():
    wahl, _a, _k = geoeffnet(anzahl=3, mehrheit="absolut")
    stimmen(wahl, {"Person 0": 4, "Person 1": 3, "Person 2": 3})
    schliessen(wahl)
    erg = services.ergebnis_auswerten(wahl)
    assert erg["ausgang"] == "stichwahl"
    # Platz zwei ist doppelt belegt: beide kommen in den zweiten Wahlgang
    assert erg["stichwahl_zwischen"][0] == "Person 0"
    assert sorted(erg["stichwahl_zwischen"]) == ["Person 0", "Person 1", "Person 2"]


def test_ja_nein_angenommen_und_abgelehnt():
    wahl, _a, _k = geoeffnet("ja_nein", anzahl=0, mehrheit="absolut")
    stimmen(wahl, {"Oui": 5, "Non": 2, "Abstention": 1})
    schliessen(wahl)
    assert services.ergebnis_auswerten(wahl)["ausgang"] == "angenommen"
    ChoixExprime.objects.all().delete()
    VoteExprime.objects.all().delete()
    stimmen(wahl, {"Oui": 2, "Non": 5})
    assert services.ergebnis_auswerten(wahl)["ausgang"] == "abgelehnt"


def test_mehrfachwahl_mit_gleichstand_an_der_grenze():
    wahl, _a, _k = geoeffnet("mehrfach", anzahl=4, posten=2)
    stimmen(wahl, {"Person 0": 5, "Person 1": 3, "Person 2": 3, "Person 3": 1})
    schliessen(wahl)
    erg = services.ergebnis_auswerten(wahl)
    assert erg["ausgang"] == "gleichstand" and erg["gewaehlt"] == ["Person 0"]
    assert sorted(erg["stichwahl_zwischen"]) == ["Person 1", "Person 2"]


def test_keine_stimmen():
    wahl, _a, _k = geoeffnet()
    schliessen(wahl)
    assert services.ergebnis_auswerten(wahl)["ausgang"] == "keine_stimmen"


# ------------------------------------------------------------------ Protokoll


def test_protokoll_entsteht_mit_der_freigabe_und_braucht_drei_unterschriften():
    wahl, ausschuss, _k = geoeffnet()
    stimmen(wahl, {"Person 0": 3, "Person 1": 1})
    schliessen(wahl)
    assert als(ausschuss[0]).get(f"{BASIS}{wahl.id}/protokoll/").status_code == 404
    freigeben(wahl, ausschuss)
    antwort = als(mitglied()[0]).get(f"{BASIS}{wahl.id}/protokoll/")
    assert antwort.status_code == 200
    assert antwort.data["ergebnis"]["gewaehlt"] == ["Person 0"]
    assert len(antwort.data["ausschuss"]) == 3 and antwort.data["unterschriften_fehlen"] == 3
    for i, user in enumerate(ausschuss, start=1):
        antwort = als(user).post(f"{BASIS}{wahl.id}/protokoll/unterschreiben/")
        assert antwort.status_code == 200 and antwort.data["unterschriften_fehlen"] == 3 - i
    # Doppelte Unterschrift zählt nicht doppelt
    antwort = als(ausschuss[0]).post(f"{BASIS}{wahl.id}/protokoll/unterschreiben/")
    assert len(antwort.data["unterschriften"]) == 3
    # Fremde dürfen nicht unterschreiben
    assert als(mitglied()[0]).post(f"{BASIS}{wahl.id}/protokoll/unterschreiben/").status_code == 403


def test_protokoll_pdf():
    wahl, ausschuss, _k = geoeffnet()
    stimmen(wahl, {"Person 0": 2})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    antwort = als(mitglied()[0]).get(f"{BASIS}{wahl.id}/protokoll/pdf/")
    assert antwort.status_code == 200 and antwort.content.startswith(b"%PDF")


# ------------------------------------------------------------------ Einsprüche


def ergebnis_offen():
    wahl, ausschuss, k = geoeffnet()
    stimmen(wahl, {"Person 0": 3, "Person 1": 1})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    return wahl, ausschuss, k


def test_einspruch_gegen_ergebnis_nicht_vor_der_veroeffentlichung():
    wahl, ausschuss, _k = geoeffnet()
    schliessen(wahl)
    user, _ = mitglied()
    antwort = als(user).post(
        f"{BASIS}einsprueche/",
        {"wahl": str(wahl.id), "art": "ergebnis", "text": "Die Zählung war fehlerhaft."},
        format="json",
    )
    assert antwort.status_code == 400


def test_einspruch_ablauf_mit_zwei_zustimmungen():
    wahl, ausschuss, _k = ergebnis_offen()
    user, _ = mitglied()
    antwort = als(user).post(
        f"{BASIS}einsprueche/",
        {"wahl": str(wahl.id), "art": "ergebnis", "text": "Die Zählung war fehlerhaft."},
        format="json",
    )
    assert antwort.status_code == 201, antwort.data
    eid = antwort.data["id"]
    assert "vorschlag" not in antwort.data  # Einreicher sieht keine Ausschuss-Interna
    # Doppelter offener Einspruch derselben Art
    assert (
        als(user)
        .post(
            f"{BASIS}einsprueche/",
            {"wahl": str(wahl.id), "art": "ergebnis", "text": "Noch einmal derselbe."},
            format="json",
        )
        .status_code
        == 400
    )
    # Ohne Begründung kein Vorschlag
    assert (
        als(ausschuss[0])
        .post(
            f"{BASIS}einsprueche/{eid}/entscheidung/",
            {"art": "abweisen", "begruendung": " "},
            format="json",
        )
        .status_code
        == 400
    )
    antwort = als(ausschuss[0]).post(
        f"{BASIS}einsprueche/{eid}/entscheidung/",
        {"art": "abweisen", "begruendung": "Zählung nachgeprüft, kein Fehler."},
        format="json",
    )
    assert antwort.status_code == 200 and antwort.data["status"] == "offen"
    assert als(ausschuss[0]).post(f"{BASIS}einsprueche/{eid}/zustimmen/").status_code == 400
    assert als(user).post(f"{BASIS}einsprueche/{eid}/zustimmen/").status_code == 403
    antwort = als(ausschuss[1]).post(f"{BASIS}einsprueche/{eid}/zustimmen/")
    assert antwort.data["status"] == EinspruchStatus.ABGEWIESEN
    # Einreicher sieht die Begründung
    antwort = als(user).get(f"{BASIS}einsprueche/{eid}/")
    assert (
        antwort.data["status"] == "abgewiesen"
        and "Zählung nachgeprüft" in antwort.data["begruendung"]
    )


def test_einspruch_ist_nur_fuer_einreicher_und_ausschuss_sichtbar():
    wahl, ausschuss, _k = ergebnis_offen()
    user, _ = mitglied()
    eid = (
        als(user)
        .post(
            f"{BASIS}einsprueche/",
            {"wahl": str(wahl.id), "art": "ergebnis", "text": "Die Zählung war fehlerhaft."},
            format="json",
        )
        .data["id"]
    )
    fremd = als(mitglied()[0])
    assert fremd.get(f"{BASIS}einsprueche/{eid}/").status_code == 403
    assert fremd.post(f"{BASIS}einsprueche/{eid}/zurueckziehen/").status_code == 403
    assert fremd.get(f"{BASIS}einsprueche/?wahl={wahl.id}").data == []
    assert len(als(ausschuss[0]).get(f"{BASIS}einsprueche/?wahl={wahl.id}").data) == 1
    assert len(als(user).get(f"{BASIS}einsprueche/?wahl={wahl.id}").data) == 1
    # Ausschussmitglieder legen selbst keine Einsprüche ein
    assert (
        als(ausschuss[0])
        .post(
            f"{BASIS}einsprueche/",
            {"wahl": str(wahl.id), "art": "ergebnis", "text": "Auch ich habe Zweifel."},
            format="json",
        )
        .status_code
        == 403
    )


def test_einspruch_gegen_ablehnung_nur_fuer_beteiligte_und_stattgabe_oeffnet_pruefung_neu():
    wahl, ausschuss = neue_wahl("person")
    user, membre = mitglied()
    k = Kandidatur.objects.create(
        wahl=wahl,
        einreicher=membre,
        name="Abgelehnte",
        status=KandidaturStatus.ABGELEHNT,
        entschieden_am=timezone.now(),
    )
    KandidatPerson.objects.create(kandidatur=k, membre=membre)
    daten = {
        "wahl": str(wahl.id),
        "art": "ablehnung",
        "kandidatur": str(k.id),
        "text": "Der Nachweis wurde übersehen.",
    }
    assert als(mitglied()[0]).post(f"{BASIS}einsprueche/", daten, format="json").status_code == 403
    antwort = als(user).post(f"{BASIS}einsprueche/", daten, format="json")
    assert antwort.status_code == 201, antwort.data
    eid = antwort.data["id"]
    als(ausschuss[0]).post(
        f"{BASIS}einsprueche/{eid}/entscheidung/",
        {"art": "stattgeben", "begruendung": "Nachweis liegt vor."},
        format="json",
    )
    als(ausschuss[1]).post(f"{BASIS}einsprueche/{eid}/zustimmen/")
    k.refresh_from_db()
    assert k.status == KandidaturStatus.EINGEREICHT
    assert Einspruch.objects.get().status == EinspruchStatus.STATTGEGEBEN


def test_einspruch_gegen_zugelassene_kandidatur_nicht_gegen_die_eigene():
    wahl, _ausschuss = neue_wahl("person")
    k = zugelassene(wahl, 1)[0]
    daten = {
        "wahl": str(wahl.id),
        "art": "waehlbarkeit",
        "kandidatur": str(k.id),
        "text": "Die Mitgliedsdauer reicht nicht aus.",
    }
    assert (
        als(k.einreicher.user).post(f"{BASIS}einsprueche/", daten, format="json").status_code == 403
    )
    assert als(mitglied()[0]).post(f"{BASIS}einsprueche/", daten, format="json").status_code == 201


def test_einspruchsfrist_laeuft_ab():
    wahl, _ausschuss = neue_wahl("person")
    k = zugelassene(wahl, 1)[0]
    k.entschieden_am = timezone.now() - timedelta(days=6)
    k.save()
    antwort = als(mitglied()[0]).post(
        f"{BASIS}einsprueche/",
        {
            "wahl": str(wahl.id),
            "art": "waehlbarkeit",
            "kandidatur": str(k.id),
            "text": "Zu spät eingereicht, aber begründet.",
        },
        format="json",
    )
    assert antwort.status_code == 400


def test_einspruch_zurueckziehen_und_vorschlag_verwerfen():
    wahl, ausschuss, _k = ergebnis_offen()
    user, _ = mitglied()
    eid = (
        als(user)
        .post(
            f"{BASIS}einsprueche/",
            {"wahl": str(wahl.id), "art": "ergebnis", "text": "Die Zählung war fehlerhaft."},
            format="json",
        )
        .data["id"]
    )
    als(ausschuss[0]).post(
        f"{BASIS}einsprueche/{eid}/entscheidung/",
        {"art": "abweisen", "begruendung": "Kein Fehler erkennbar."},
        format="json",
    )
    antwort = als(ausschuss[1]).post(f"{BASIS}einsprueche/{eid}/verwerfen/")
    assert antwort.data["vorschlag"] == "" and antwort.data["zustimmungen"] == []
    antwort = als(user).post(f"{BASIS}einsprueche/{eid}/zurueckziehen/")
    assert antwort.data["status"] == "zurueckgezogen"
    assert als(ausschuss[0]).post(f"{BASIS}einsprueche/{eid}/zustimmen/").status_code == 400

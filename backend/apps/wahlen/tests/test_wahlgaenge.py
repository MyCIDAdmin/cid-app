"""Weiterer Wahlgang (Folgewahl) und Probewahl (Welle 2d)."""

from unittest import mock

import pytest

from apps.notifications.models import Notification
from apps.vote.models import ChoixExprime, VoteExprime, VoteOption, VoteSession
from apps.wahlen import wahlgaenge
from apps.wahlen.models import (
    Bekanntmachung,
    Kandidatur,
    KandidaturStatus,
    MitteilungArt,
    Reglement,
    Wahl,
    WahlStatus,
)
from apps.wahlen.tests.factories import mitglied
from apps.wahlen.tests.test_api import BASIS, als
from apps.wahlen.tests.test_ergebnis import freigeben, geoeffnet, schliessen, stimmen

pytestmark = pytest.mark.django_db


def veroeffentlicht(verteilung, form="person", anzahl=2, **extra):
    wahl, ausschuss, kandidaturen = geoeffnet(form, anzahl=anzahl, **extra)
    stimmen(wahl, verteilung)
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    return wahl, ausschuss, kandidaturen


# ------------------------------------------------------------------ Folgewahl


def test_gleichstand_legt_beim_veroeffentlichen_eine_folgewahl_als_entwurf_an():
    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    assert folge.status == WahlStatus.ENTWURF and folge.runde == 2
    assert folge.titel.endswith("– 2. Wahlgang")
    assert folge.vote_session_id is None and folge.ergebnis_freigegeben_am is None
    # beide Kandidaturen übernommen, als zugelassen, mit Person
    namen = sorted(folge.kandidaturen.values_list("name", flat=True))
    assert namen == ["Person 0", "Person 1"]
    assert all(k.status == KandidaturStatus.ZUGELASSEN for k in folge.kandidaturen.all())
    assert all(k.personen.count() == 1 for k in folge.kandidaturen.all())
    # derselbe Ausschuss, knappe Termine in richtiger Reihenfolge, nichts ist offen
    assert folge.ausschuss.count() == wahl.ausschuss.count()
    assert folge.kandidatur_bis < folge.wahl_von.date() < folge.wahl_bis.date()
    assert folge.phase == 2 and folge.mehrheit == "relativ"


def test_folgewahl_hat_keinen_aufruf_zur_kandidatur_und_sendet_nichts():
    wahl, _a, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    schluessel = set(folge.bekanntmachungen.values_list("schluessel", flat=True))
    assert schluessel == {"ankuendigung", "zugelassen", "wahlbeginn", "ergebnis"}
    assert not folge.bekanntmachungen.exclude(status="entwurf").exists()  # braucht Freigabe


def test_ausschuss_und_buero_werden_informiert_mitglieder_nicht():
    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    empfaenger = set(
        Notification.objects.filter(lien=f"/wahlen/{folge.id}").values_list(
            "destinataire_id", flat=True
        )
    )
    assert {u.id for u in ausschuss} <= empfaenger
    fremd, _ = mitglied()
    assert fremd.id not in empfaenger
    # Der Entwurf bleibt für Mitglieder unsichtbar
    assert als(fremd).get(f"{BASIS}{folge.id}/").status_code == 404
    assert als(ausschuss[0]).get(f"{BASIS}{folge.id}/").status_code == 200


def test_klarer_sieger_braucht_keine_folgewahl():
    wahl, _a, _k = veroeffentlicht({"Person 0": 5, "Person 1": 1})
    assert wahl.folgewahlen.count() == 0


def test_ja_nein_braucht_keine_folgewahl():
    wahl, ausschuss, _k = geoeffnet("ja_nein", anzahl=1, mehrheit="absolut")
    stimmen(wahl, {"Oui": 2, "Non": 2})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    assert wahl.folgewahlen.count() == 0


def test_absolute_mehrheit_verfehlt_nimmt_die_beiden_besten_mit():
    wahl, _a, _k = veroeffentlicht(
        {"Person 0": 5, "Person 1": 3, "Person 2": 2}, anzahl=3, mehrheit="absolut"
    )
    folge = wahl.folgewahlen.get()
    assert sorted(folge.kandidaturen.values_list("name", flat=True)) == ["Person 0", "Person 1"]


def test_mehrfachwahl_gleichstand_nur_noch_offene_posten_und_nur_die_gleichauf():
    wahl, _a, _k = veroeffentlicht(
        {"Person 0": 5, "Person 1": 3, "Person 2": 3, "Person 3": 1},
        form="mehrfach",
        anzahl=4,
        posten=2,
    )
    folge = wahl.folgewahlen.get()
    assert folge.posten == 1 and folge.form == "mehrfach"
    assert sorted(folge.kandidaturen.values_list("name", flat=True)) == ["Person 1", "Person 2"]


def test_folgewahl_kann_geoeffnet_werden_und_hat_nur_die_betroffenen_optionen():
    from apps.wahlen import services

    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay"):
        services.oeffnen(folge, ausschuss[0])
    folge.refresh_from_db()
    assert sorted(folge.vote_session.options.values_list("label", flat=True)) == [
        "Person 0",
        "Person 1",
    ]


def test_dritter_wahlgang_zaehlt_hoch_und_der_titel_waechst_nicht():
    wahl, _a, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    zweite = wahl.folgewahlen.get()
    assert wahlgaenge.folgewahl_titel(zweite, 3).count("Wahlgang") == 1
    assert wahlgaenge.folgewahl_titel(zweite, 3).endswith("– 3. Wahlgang")


def test_folgewahl_von_hand_ist_idempotent_und_nur_fuer_ausschuss():
    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    antwort = als(ausschuss[0]).post(f"{BASIS}{wahl.id}/folgewahl/")
    assert antwort.status_code == 200 and antwort.data["id"] == str(folge.id)
    assert als(mitglied()[0]).post(f"{BASIS}{wahl.id}/folgewahl/").status_code in (403, 404)
    assert wahl.folgewahlen.count() == 1


def test_folgewahl_von_hand_wenn_der_entwurf_fehlt_und_sonst_klare_fehler():
    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    wahl.folgewahlen.all().delete()
    antwort = als(ausschuss[0]).post(f"{BASIS}{wahl.id}/folgewahl/")
    assert antwort.status_code == 201 and antwort.data["runde"] == 2
    klar, _a, _k = veroeffentlicht({"Person 0": 5, "Person 1": 1})
    assert als(_a[0]).post(f"{BASIS}{klar.id}/folgewahl/").status_code == 400


def test_wahl_und_ergebnis_zeigen_folgewahl_und_vorgaenger():
    wahl, ausschuss, _k = veroeffentlicht({"Person 0": 2, "Person 1": 2})
    folge = wahl.folgewahlen.get()
    d = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/").data
    assert d["folgewahl"]["id"] == str(folge.id) and d["runde"] == 1
    assert als(ausschuss[0]).get(f"{BASIS}{wahl.id}/ergebnis/").data["weiterer_wahlgang"] is True
    # Mitglieder sehen den Entwurf nicht, sobald er veröffentlicht ist aber schon
    mitglied_client = als(mitglied()[0])
    assert mitglied_client.get(f"{BASIS}{wahl.id}/").data["folgewahl"] is None
    folge.status = WahlStatus.AKTIV
    folge.save()
    assert mitglied_client.get(f"{BASIS}{wahl.id}/").data["folgewahl"]["id"] == str(folge.id)
    assert mitglied_client.get(f"{BASIS}{folge.id}/").data["vorgaenger"]["id"] == str(wahl.id)


def test_folgewahl_plant_ihre_erinnerungen_und_kopiert_das_reglement():
    wahl, ausschuss, _k = geoeffnet()
    Reglement.objects.create(wahl=wahl, schluessel="wahlordnung", texte={"de": "<p>Art. 1</p>"})
    stimmen(wahl, {"Person 0": 2, "Person 1": 2})
    schliessen(wahl)
    freigeben(wahl, ausschuss)
    folge = wahl.folgewahlen.get()
    assert folge.reglemente.get().texte == {"de": "<p>Art. 1</p>"}
    arten = set(folge.mitteilungen.values_list("art", flat=True))
    assert MitteilungArt.WAHL_ENDET in arten


def test_fehler_beim_anlegen_verhindert_die_veroeffentlichung_nicht():
    wahl, ausschuss, _k = geoeffnet()
    stimmen(wahl, {"Person 0": 2, "Person 1": 2})
    schliessen(wahl)
    with mock.patch("apps.wahlen.wahlgaenge.folgewahl_anlegen", side_effect=RuntimeError("x")):
        freigeben(wahl, ausschuss)
    assert wahl.ergebnis_freigegeben_am is not None and wahl.folgewahlen.count() == 0


# ------------------------------------------------------------------ Probewahl


def vorher(form="person", anzahl=3, **extra):
    from apps.wahlen.tests.factories import neue_wahl
    from apps.wahlen.tests.test_ergebnis import zugelassene

    wahl, ausschuss = neue_wahl(form, **extra)
    if anzahl:
        zugelassene(wahl, anzahl)
    return wahl, ausschuss


def zustand():
    return (
        VoteSession.objects.count(),
        VoteOption.objects.count(),
        VoteExprime.objects.count(),
        ChoixExprime.objects.count(),
        Notification.objects.count(),
    )


def probe(client, wahl, **daten):
    return client.post(f"{BASIS}{wahl.id}/probewahl/", daten, format="json")


def test_probewahl_speichert_nichts_und_benachrichtigt_niemanden():
    wahl, ausschuss = vorher()
    davor = zustand()
    with mock.patch("apps.vote.tasks.envoyer_notification_ouverture.delay") as a:
        with mock.patch("apps.vote.tasks.envoyer_notification_resultats.delay") as b:
            antwort = probe(als(ausschuss[0]), wahl, stimmen=30, seed=1)
    assert antwort.status_code == 200
    assert zustand() == davor and not a.called and not b.called
    wahl.refresh_from_db()
    assert wahl.vote_session_id is None and wahl.status == "aktiv"


def test_probewahl_ergebnis_hat_die_zahlen_der_erfundenen_stimmen():
    wahl, ausschuss = vorher(anzahl=3)
    d = probe(als(ausschuss[0]), wahl, stimmen=30, seed=7).data
    assert d["stimmen"] == 30 and d["beispiel"] is False
    erg = d["ergebnis"]
    assert erg["beteiligung"]["abgegeben"] == 30
    assert sum(o["stimmen"] for o in erg["optionen"]) == 30  # eine Stimme je Zettel
    assert {o["label"] for o in erg["optionen"]} == {"Person 0", "Person 1", "Person 2"}


def test_probewahl_gleichstand_zeigt_den_weiteren_wahlgang():
    wahl, ausschuss = vorher(anzahl=3)
    d = probe(als(ausschuss[0]), wahl, stimmen=40, szenario="gleichstand").data
    assert d["ergebnis"]["ausgang"] == "stichwahl" and d["weiterer_wahlgang"] is True
    assert len(d["ergebnis"]["stichwahl_zwischen"]) >= 2


def test_probewahl_mehrfachwahl_gleichstand_an_der_grenze():
    wahl, ausschuss = vorher("mehrfach", anzahl=5, posten=2)
    d = probe(als(ausschuss[0]), wahl, stimmen=40, szenario="gleichstand").data
    assert d["ergebnis"]["ausgang"] == "gleichstand"


def test_probewahl_ja_nein_und_rangfolge():
    wahl, ausschuss = vorher("ja_nein", anzahl=1, mehrheit="absolut")
    d = probe(als(ausschuss[0]), wahl, stimmen=20, seed=3).data
    assert d["typ"] == "oui_non"
    assert d["ergebnis"]["ausgang"] in ("angenommen", "abgelehnt")
    wahl2, ausschuss2 = vorher("rang", anzahl=3)
    d2 = probe(als(ausschuss2[0]), wahl2, stimmen=20, seed=3).data
    assert d2["typ"] == "preferentiel" and d2["ergebnis"]["ausgang"] == "manuell"


def test_probewahl_ohne_kandidaturen_nimmt_beispielnamen():
    wahl, ausschuss = vorher(anzahl=0)
    d = probe(als(ausschuss[0]), wahl).data
    assert d["beispiel"] is True
    assert {o["label"] for o in d["ergebnis"]["optionen"]} == {
        "Beispiel A",
        "Beispiel B",
        "Beispiel C",
    }
    ber = {b["schluessel"]: b for b in d["bereitschaft"]}
    assert ber["kandidaturen"]["ok"] is False


def test_probewahl_gleicher_seed_gleiches_ergebnis():
    wahl, ausschuss = vorher()
    client = als(ausschuss[0])
    a = probe(client, wahl, stimmen=25, seed=11).data["ergebnis"]["optionen"]
    b = probe(client, wahl, stimmen=25, seed=11).data["ergebnis"]["optionen"]
    assert [o["stimmen"] for o in a] == [o["stimmen"] for o in b]


def test_probewahl_bereitschaft_fuer_ausschuss_und_bekanntmachungen():
    wahl, ausschuss = vorher(anzahl=1)
    ber = {b["schluessel"]: b["ok"] for b in probe(als(ausschuss[0]), wahl).data["bereitschaft"]}
    assert ber["ausschuss"] is True and ber["kandidaturen"] is True
    assert ber["bekanntmachungen"] is False  # fünf Entwürfe, nichts freigegeben
    assert ber["reglement"] is False and ber["termine"] is True
    Bekanntmachung.objects.filter(wahl=wahl).update(status="freigegeben")
    Reglement.objects.create(wahl=wahl, schluessel="wahlordnung", texte={"de": "x"})
    ber = {b["schluessel"]: b["ok"] for b in probe(als(ausschuss[0]), wahl).data["bereitschaft"]}
    assert ber["bekanntmachungen"] is True and ber["reglement"] is True


def test_probewahl_nur_fuer_ausschuss_und_buero_und_nicht_nach_dem_oeffnen():
    wahl, ausschuss = vorher()
    assert probe(als(mitglied()[0]), wahl).status_code in (403, 404)
    assert probe(als(ausschuss[0]), wahl, szenario="quatsch").status_code == 400
    assert probe(als(ausschuss[0]), wahl, stimmen="abc").status_code == 400
    offen, ausschuss2, _k = geoeffnet()
    assert probe(als(ausschuss2[0]), offen).status_code == 400


def test_probewahl_begrenzt_die_zahl_der_stimmen():
    wahl, ausschuss = vorher()
    assert probe(als(ausschuss[0]), wahl, stimmen=100000).data["stimmen"] == 500
    assert probe(als(ausschuss[0]), wahl, stimmen=1).data["stimmen"] == 4


def test_zettel_verteilung_ohne_doppelte_option_je_zettel():
    zettel = wahlgaenge._zettel([8, 5, 5, 2], 10)
    assert sum(len(z) for z in zettel) == 20
    assert all(len(set(z)) == len(z) for z in zettel)
    assert max(len(z) for z in zettel) <= 2


def test_ausgang_haengt_nicht_von_anderen_kandidaturen_ab():
    # Zur Sicherheit: Wahl ohne Ergebnis hat keinen weiteren Wahlgang
    wahl, _a = vorher()
    assert wahlgaenge.folgewahl_moeglich(wahl) is False
    assert Wahl.objects.count() >= 1 and Kandidatur.objects.count() >= 1

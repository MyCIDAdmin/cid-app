"""Automatische Erinnerungen entlang des Ablaufs (Welle 2c)."""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone

from apps.notifications.models import Notification
from apps.vote.models import ParticipationVote
from apps.wahlen import mitteilungen, tasks
from apps.wahlen.models import (
    Kandidatur,
    KandidaturStatus,
    Mitteilung,
    MitteilungArt,
    MitteilungStatus,
)
from apps.wahlen.tests.factories import mitglied, neue_wahl
from apps.wahlen.tests.test_api import BASIS, als
from apps.wahlen.tests.test_ergebnis import freigeben, geoeffnet, schliessen, stimmen

pytestmark = pytest.mark.django_db


def faellig(wahl, art, nach=timedelta(minutes=5), bezug=""):
    """„Jetzt“, wenn die Erinnerung `nach` überfällig ist (Zeitreise für den Test)."""
    m = Mitteilung.objects.get(wahl=wahl, art=art, bezug=bezug)
    return m.versand_am + nach


def notizen(art):
    titel = [mitteilungen.TEXTE[art][s][0] for s in ("de", "fr", "ar")]
    return Notification.objects.filter(titre__in=titel)


def erhalten(art):
    return set(notizen(art).values_list("destinataire_id", flat=True))


# ------------------------------------------------------------------ Plan


def test_plan_entsteht_aus_den_terminen_und_ist_idempotent():
    wahl, _a = neue_wahl("liste")
    mitteilungen.planen(wahl)
    mitteilungen.planen(wahl)
    arten = set(wahl.mitteilungen.values_list("art", flat=True))
    assert arten == {
        MitteilungArt.KANDIDATUR_ENDET,
        MitteilungArt.EINSPRUCH_LISTEN,
        MitteilungArt.NICHTWAEHLER,
        MitteilungArt.WAHL_ENDET,
    }
    assert wahl.mitteilungen.count() == 4
    ende = wahl.mitteilungen.get(art=MitteilungArt.WAHL_ENDET)
    assert ende.versand_am == wahl.wahl_bis - timedelta(hours=2)
    nw = wahl.mitteilungen.get(art=MitteilungArt.NICHTWAEHLER)
    assert nw.versand_am == wahl.wahl_bis - timedelta(hours=24)
    assert nw.kanaele == ["app"]


def test_termine_aendern_zieht_geplante_nach_aber_nicht_gesendete():
    wahl, _a = neue_wahl("liste")
    mitteilungen.planen(wahl)
    gesendet = wahl.mitteilungen.get(art=MitteilungArt.KANDIDATUR_ENDET)
    gesendet.status = MitteilungStatus.GESENDET
    gesendet.save()
    alt = gesendet.versand_am
    wahl.kandidatur_bis += timedelta(days=2)
    wahl.wahl_bis += timedelta(days=1)
    wahl.save()
    mitteilungen.planen(wahl)
    gesendet.refresh_from_db()
    assert gesendet.versand_am == alt
    ende = wahl.mitteilungen.get(art=MitteilungArt.WAHL_ENDET)
    assert ende.versand_am == wahl.wahl_bis - timedelta(hours=2)


def test_zu_kurze_fenster_ergeben_keine_sinnlose_erinnerung():
    wahl, _a = neue_wahl("liste")
    wahl.wahl_bis = wahl.wahl_von + timedelta(hours=12)
    wahl.kandidatur_bis = wahl.kandidatur_von + timedelta(days=2)
    wahl.save()
    mitteilungen.planen(wahl)
    arten = set(wahl.mitteilungen.values_list("art", flat=True))
    assert MitteilungArt.NICHTWAEHLER not in arten
    assert MitteilungArt.KANDIDATUR_ENDET not in arten


# ------------------------------------------------------------------ Versand


def test_faellige_erinnerung_geht_an_alle_aktiven_einmal():
    wahl, _a = neue_wahl("liste")
    mitteilungen.planen(wahl)
    _u, _m = mitglied()
    jetzt = faellig(wahl, MitteilungArt.KANDIDATUR_ENDET)
    ergebnis = mitteilungen.faellige_senden(jetzt)
    assert ergebnis["gesendet"] == 1
    m = wahl.mitteilungen.get(art=MitteilungArt.KANDIDATUR_ENDET)
    assert m.status == MitteilungStatus.GESENDET and m.anzahl >= 1
    assert notizen(MitteilungArt.KANDIDATUR_ENDET).count() == m.anzahl
    assert mitteilungen.faellige_senden(jetzt)["gesendet"] == 0


def test_ueberholte_erinnerung_wird_nicht_mehr_gesendet():
    wahl, _a = neue_wahl("liste")
    mitteilungen.planen(wahl)
    jetzt = faellig(wahl, MitteilungArt.KANDIDATUR_ENDET, nach=timedelta(hours=7))
    ergebnis = mitteilungen.faellige_senden(jetzt)
    assert ergebnis["uebersprungen"] >= 1
    m = wahl.mitteilungen.get(art=MitteilungArt.KANDIDATUR_ENDET)
    assert m.status == MitteilungStatus.UEBERSPRUNGEN
    assert not notizen(MitteilungArt.KANDIDATUR_ENDET).exists()


def test_entwurf_sendet_nichts_und_leere_kanaele_auch_nicht():
    wahl, _a = neue_wahl("liste", aktiv=False)
    mitteilungen.planen(wahl)
    jetzt = faellig(wahl, MitteilungArt.KANDIDATUR_ENDET)
    mitteilungen.faellige_senden(jetzt)
    assert wahl.mitteilungen.get(art=MitteilungArt.KANDIDATUR_ENDET).status == "geplant"
    wahl.status = "aktiv"
    wahl.save()
    m = wahl.mitteilungen.get(art=MitteilungArt.KANDIDATUR_ENDET)
    m.kanaele = []
    m.save()
    mitteilungen.faellige_senden(jetzt)
    m.refresh_from_db()
    assert m.status == MitteilungStatus.UEBERSPRUNGEN
    assert not notizen(MitteilungArt.KANDIDATUR_ENDET).exists()


def test_nichtwaehler_bekommen_die_erinnerung_wer_schon_gewaehlt_hat_nicht():
    wahl, _a, _k = geoeffnet()
    waehler_user, waehler = mitglied()
    saeumig_user, saeumig = mitglied()
    mitteilungen.planen(wahl)
    from apps.wahlen.services import _eligible_ids

    ids = _eligible_ids(wahl.vote_session)
    assert waehler.id in ids and saeumig.id in ids
    ParticipationVote.objects.create(session=wahl.vote_session, membre=waehler)
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.NICHTWAEHLER))
    bekommen = erhalten(MitteilungArt.NICHTWAEHLER)
    assert saeumig_user.id in bekommen and waehler_user.id not in bekommen


def test_wahl_endet_geht_an_wahlberechtigte_nur_solange_die_wahl_laeuft():
    wahl, _a, _k = geoeffnet()
    user, _membre = mitglied()
    mitteilungen.planen(wahl)
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.WAHL_ENDET))
    assert user.id in erhalten(MitteilungArt.WAHL_ENDET)
    Notification.objects.all().delete()
    # Wahl wurde vorzeitig geschlossen: die Erinnerung ist überholt.
    wahl2, _a2, _k2 = geoeffnet()
    mitteilungen.planen(wahl2)
    schliessen(wahl2)
    mitteilungen.faellige_senden(faellig(wahl2, MitteilungArt.WAHL_ENDET))
    assert (
        wahl2.mitteilungen.get(art=MitteilungArt.WAHL_ENDET).status
        == MitteilungStatus.UEBERSPRUNGEN
    )
    assert not notizen(MitteilungArt.WAHL_ENDET).exists()


def test_sprache_folgt_dem_konto():
    wahl, _a = neue_wahl("liste")
    user, _m = mitglied()
    user.langue_preferee = "fr"
    user.save()
    deutsch, _m2 = mitglied()
    deutsch.langue_preferee = "de"
    deutsch.save()
    mitteilungen.planen(wahl)
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.KANDIDATUR_ENDET))
    fr = notizen(MitteilungArt.KANDIDATUR_ENDET).get(destinataire=user)
    assert fr.titre == mitteilungen.TEXTE[MitteilungArt.KANDIDATUR_ENDET]["fr"][0]
    assert wahl.titel in fr.message
    de = notizen(MitteilungArt.KANDIDATUR_ENDET).get(destinataire=deutsch)
    assert de.titre == mitteilungen.TEXTE[MitteilungArt.KANDIDATUR_ENDET]["de"][0]


# ------------------------------------------------------------------ Rückfrage, Ergebnis


def test_rueckfrage_erinnert_nur_die_beteiligten_und_nur_wenn_sie_offen_ist():
    wahl, _a = neue_wahl("person")
    _u, membre = mitglied()
    _u2, andere = mitglied()
    k = Kandidatur.objects.create(
        wahl=wahl,
        einreicher=membre,
        name="Person X",
        status=KandidaturStatus.RUECKFRAGE,
        nachbesserung_bis=timezone.now() + timedelta(hours=25),
    )
    mitteilungen.rueckfrage_planen(k)
    m = Mitteilung.objects.get(wahl=wahl, art=MitteilungArt.RUECKFRAGE_FRIST, bezug=str(k.id))
    assert abs(m.versand_am - (k.nachbesserung_bis - timedelta(hours=24))) < timedelta(seconds=1)
    assert m.kanaele == ["app", "mail"]
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.RUECKFRAGE_FRIST, bezug=str(k.id)))
    bekommen = erhalten(MitteilungArt.RUECKFRAGE_FRIST)
    assert bekommen == {membre.user_id}
    assert andere.user_id not in bekommen

    # nachgebessert und zugelassen: keine Erinnerung mehr
    k2 = Kandidatur.objects.create(
        wahl=wahl,
        einreicher=andere,
        name="Person Y",
        status=KandidaturStatus.RUECKFRAGE,
        nachbesserung_bis=timezone.now() + timedelta(hours=25),
    )
    mitteilungen.rueckfrage_planen(k2)
    k2.status = KandidaturStatus.ZUGELASSEN
    k2.save()
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.RUECKFRAGE_FRIST, bezug=str(k2.id)))
    assert Mitteilung.objects.get(bezug=str(k2.id)).status == MitteilungStatus.UEBERSPRUNGEN
    assert andere.user_id not in erhalten(MitteilungArt.RUECKFRAGE_FRIST)


def test_ergebnis_einspruch_wird_mit_der_freigabe_geplant():
    wahl, ausschuss, _k = geoeffnet()
    stimmen(wahl, {"Person 0": 3, "Person 1": 1})
    schliessen(wahl)
    assert not wahl.mitteilungen.filter(art=MitteilungArt.EINSPRUCH_ERGEBNIS).exists()
    freigeben(wahl, ausschuss)
    m = wahl.mitteilungen.get(art=MitteilungArt.EINSPRUCH_ERGEBNIS)
    from apps.wahlen import services

    assert m.versand_am == services.einspruch_fenster_ende(wahl, "ergebnis", None) - timedelta(
        days=2
    )
    # nach der Freigabe ist die Wahl abgeschlossen; die Erinnerung geht trotzdem raus
    mitteilungen.faellige_senden(faellig(wahl, MitteilungArt.EINSPRUCH_ERGEBNIS))
    assert wahl.mitteilungen.get(art=MitteilungArt.EINSPRUCH_ERGEBNIS).status == "gesendet"


def test_beat_aufgabe_ruft_den_versand_auf():
    wahl, _a = neue_wahl("liste")
    mitteilungen.planen(wahl)
    with mock.patch(
        "apps.wahlen.mitteilungen.timezone.now",
        return_value=faellig(wahl, MitteilungArt.KANDIDATUR_ENDET),
    ):
        assert tasks.mitteilungen_senden()["gesendet"] == 1


# ------------------------------------------------------------------ API


def test_plan_enthaelt_alle_ausloeser_in_zeitlicher_reihenfolge_nur_fuer_ausschuss():
    wahl, ausschuss = neue_wahl("liste")
    antwort = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/mitteilungsplan/")
    assert antwort.status_code == 200
    typen = {z["typ"] for z in antwort.data}
    assert typen == {"bekanntmachung", "erinnerung", "ereignis"}
    zeiten = [z["versand_am"] for z in antwort.data if z["versand_am"]]
    assert zeiten == sorted(zeiten)
    assert antwort.data[-1]["art"] == "pruef_entscheidung"
    assert als(mitglied()[0]).get(f"{BASIS}{wahl.id}/mitteilungsplan/").status_code == 403


def test_kanaele_aendern_nur_vor_dem_versand_und_nur_bekannte():
    wahl, ausschuss = neue_wahl("liste")
    mitteilungen.planen(wahl)
    m = wahl.mitteilungen.get(art=MitteilungArt.WAHL_ENDET)
    url = f"{BASIS}mitteilungen/{m.id}/"
    assert als(mitglied()[0]).patch(url, {"kanaele": []}, format="json").status_code == 403
    assert als(ausschuss[0]).patch(url, {"kanaele": ["fax"]}, format="json").status_code == 400
    ok = als(ausschuss[0]).patch(url, {"kanaele": ["mail", "app"]}, format="json")
    assert ok.status_code == 200 and ok.data["kanaele"] == ["app", "mail"]
    assert als(ausschuss[0]).patch(url, {"kanaele": []}, format="json").data["kanaele"] == []
    m.status = MitteilungStatus.GESENDET
    m.save()
    assert als(ausschuss[0]).patch(url, {"kanaele": ["app"]}, format="json").status_code == 400

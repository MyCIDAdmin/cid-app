"""Live-Termine zur Wahl: Anlegen, Kalender-Spiegelung, „Erinnere mich“, Tages-Erinnerung."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.kalender.models import Antwort, Termin, TerminEinladung
from apps.kalender.tasks import termin_erinnerungen
from apps.notifications.models import Notification
from apps.wahlen import mitteilungen
from apps.wahlen.models import MitteilungArt, MitteilungStatus, WahlTermin
from apps.wahlen.tests.factories import mitglied, neue_wahl, verwaltung
from apps.wahlen.tests.test_api import BASIS, als

pytestmark = pytest.mark.django_db

URL = f"{BASIS}termine/"


def eingabe(wahl, tage=3, **extra):
    beginn = timezone.now() + timedelta(days=tage)
    daten = {
        "wahl": str(wahl.id),
        "art": "vorstellung",
        "titel": "Live-Vorstellungsrunde",
        "beginn": beginn.isoformat(),
        "link": "https://meet.example.org/abc",
        "hinweis": "Bitte Fragen vorab im Chat stellen.",
    }
    daten.update(extra)
    return daten


def anlegen(wahl, user, **extra):
    antwort = als(user).post(URL, eingabe(wahl, **extra), format="json")
    assert antwort.status_code == 201, antwort.data
    return WahlTermin.objects.get(pk=antwort.data["id"])


def test_ausschuss_legt_termin_an_und_er_spiegelt_sich_in_den_kalender():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0])
    assert wt.termin is not None
    t = wt.termin
    assert t.sichtbarkeit == "mitglieder" and t.status == "freigegeben" and t.wichtig
    assert t.link == wt.link and t.erinnerung_stunden == 1 and t.beginn == wt.beginn


def test_nur_ausschuss_und_buero_duerfen_anlegen_aendern_loeschen():
    wahl, ausschuss = neue_wahl("liste")
    fremd, _m = mitglied()
    assert als(fremd).post(URL, eingabe(wahl), format="json").status_code == 403
    wt = anlegen(wahl, verwaltung())
    assert als(fremd).patch(f"{URL}{wt.id}/", {"titel": "X"}, format="json").status_code == 403
    assert als(fremd).delete(f"{URL}{wt.id}/").status_code == 403
    assert als(ausschuss[1]).delete(f"{URL}{wt.id}/").status_code == 204


def test_eingabe_wird_geprueft():
    wahl, ausschuss = neue_wahl("liste")
    c = als(ausschuss[0])
    vergangen = (timezone.now() - timedelta(hours=1)).isoformat()
    assert c.post(URL, eingabe(wahl, beginn=vergangen), format="json").status_code == 400
    nach_wahl = (wahl.wahl_bis + timedelta(days=1)).isoformat()
    assert c.post(URL, eingabe(wahl, beginn=nach_wahl), format="json").status_code == 400
    assert c.post(URL, eingabe(wahl, link="javascript:alert(1)"), format="json").status_code == 400
    assert c.post(URL, eingabe(wahl, titel="  "), format="json").status_code == 400
    assert c.post(URL, eingabe(wahl, art="unbekannt"), format="json").status_code == 400
    ende = (timezone.now() + timedelta(days=2)).isoformat()
    assert c.post(URL, eingabe(wahl, ende=ende), format="json").status_code == 400


def test_entwurf_hat_keinen_kalendereintrag_bis_zur_veroeffentlichung():
    wahl, ausschuss = neue_wahl("liste", aktiv=False)
    wt = anlegen(wahl, ausschuss[0])
    assert wt.termin is None and not Termin.objects.exists()
    mitglied_user, _m = mitglied()
    assert als(mitglied_user).get(f"{URL}?wahl={wahl.id}").status_code == 403
    assert als(verwaltung()).post(f"{BASIS}{wahl.id}/veroeffentlichen/").status_code == 200
    wt.refresh_from_db()
    assert wt.termin is not None and wt.termin.status == "freigegeben"


def test_aendern_zieht_den_kalender_nach_und_setzt_die_erinnerung_zurueck():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0])
    Termin.objects.filter(pk=wt.termin_id).update(letzte_erinnerung=timezone.now())
    neu = (timezone.now() + timedelta(days=4)).isoformat()
    antwort = als(ausschuss[0]).patch(
        f"{URL}{wt.id}/", {"beginn": neu, "titel": "Verschoben"}, format="json"
    )
    assert antwort.status_code == 200
    t = Termin.objects.get(pk=wt.termin_id)
    assert t.titel == "Verschoben" and t.letzte_erinnerung is None
    assert t.beginn.isoformat() == WahlTermin.objects.get(pk=wt.id).beginn.isoformat()


def test_loeschen_entfernt_den_kalendereintrag_und_die_geplante_mitteilung():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0])
    mitteilungen.planen(wahl)
    assert wahl.mitteilungen.filter(art=MitteilungArt.TERMIN_MORGEN).count() == 1
    termin_id = wt.termin_id
    assert als(ausschuss[0]).delete(f"{URL}{wt.id}/").status_code == 204
    assert not Termin.objects.filter(pk=termin_id).exists()
    mitteilungen.planen(wahl)
    assert not wahl.mitteilungen.filter(art=MitteilungArt.TERMIN_MORGEN).exists()


def test_erinnere_mich_ist_eine_zusage_im_kalender_und_laesst_sich_zuruecknehmen():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0])
    user, _m = mitglied()
    c = als(user)
    antwort = c.post(f"{URL}{wt.id}/erinnern/", {"an": True}, format="json")
    assert antwort.status_code == 200 and antwort.data["erinnert"] is True
    assert TerminEinladung.objects.get(termin=wt.termin, user=user).antwort == Antwort.ZUSAGE
    liste = c.get(f"{URL}?wahl={wahl.id}").data
    assert liste[0]["erinnert"] is True
    antwort = c.post(f"{URL}{wt.id}/erinnern/", {"an": False}, format="json")
    assert antwort.data["erinnert"] is False
    assert not TerminEinladung.objects.filter(termin=wt.termin, user=user).exists()


def test_eine_stunde_vorher_erinnert_der_kalender_nur_wer_zugesagt_hat():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0], tage=1)
    wt.beginn = timezone.now() + timedelta(minutes=50)
    wt.save()
    als(ausschuss[0]).patch(f"{URL}{wt.id}/", {"beginn": wt.beginn.isoformat()}, format="json")
    ja, _m1 = mitglied()
    nein, _m2 = mitglied()
    als(ja).post(f"{URL}{wt.id}/erinnern/", {"an": True}, format="json")
    termin_erinnerungen()
    empfaenger = set(
        Notification.objects.filter(titre__contains="Live-Vorstellungsrunde").values_list(
            "destinataire_id", flat=True
        )
    )
    assert ja.id in empfaenger and nein.id not in empfaenger


def test_tages_mitteilung_wird_geplant_gesendet_und_nur_einmal():
    wahl, _a = neue_wahl("liste")
    ausschuss_user = verwaltung()
    wt = anlegen(wahl, ausschuss_user, tage=3)
    mitteilungen.planen(wahl)
    m = wahl.mitteilungen.get(art=MitteilungArt.TERMIN_MORGEN, bezug=str(wt.id))
    assert m.versand_am == wt.beginn - timedelta(hours=24) and m.kanaele == ["app"]
    user, _m = mitglied()
    jetzt = m.versand_am + timedelta(minutes=5)
    assert mitteilungen.faellige_senden(jetzt)["gesendet"] >= 1
    m.refresh_from_db()
    assert m.status == MitteilungStatus.GESENDET and m.anzahl >= 1
    titel = {"Morgen: Live-Vorstellungsrunde", "Demain : Live-Vorstellungsrunde"}
    titel.add("غدًا: Live-Vorstellungsrunde")
    assert Notification.objects.filter(destinataire=user, titre__in=titel).exists()
    assert mitteilungen.faellige_senden(jetzt)["gesendet"] == 0


def test_verschobener_termin_zieht_die_geplante_mitteilung_nach():
    wahl, ausschuss = neue_wahl("liste")
    wt = anlegen(wahl, ausschuss[0], tage=3)
    mitteilungen.planen(wahl)
    wt.beginn += timedelta(days=1)
    wt.save()
    mitteilungen.planen(wahl)
    m = wahl.mitteilungen.get(art=MitteilungArt.TERMIN_MORGEN)
    assert m.versand_am == wt.beginn - timedelta(hours=24)


def test_termin_innerhalb_von_24_stunden_bekommt_keine_tagesmitteilung():
    wahl, ausschuss = neue_wahl("liste")
    anlegen(wahl, ausschuss[0], tage=0, beginn=(timezone.now() + timedelta(hours=5)).isoformat())
    mitteilungen.planen(wahl)
    assert not wahl.mitteilungen.filter(art=MitteilungArt.TERMIN_MORGEN).exists()


def test_plan_fuer_den_ausschuss_nennt_den_termin():
    wahl, ausschuss = neue_wahl("liste")
    anlegen(wahl, ausschuss[0], tage=3)
    zeilen = als(ausschuss[0]).get(f"{BASIS}{wahl.id}/mitteilungsplan/").data
    zeile = next(z for z in zeilen if z["art"] == "termin_morgen")
    assert zeile["bezug_name"] == "Live-Vorstellungsrunde" and zeile["zielgruppe"] == "alle"

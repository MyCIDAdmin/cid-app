"""Tests — Benachrichtigungen des Kalenders (Release 19)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.kalender.models import Antwort, Dienst, DienstEintragung, TerminEinladung, Terminumfrage
from apps.kalender.tasks import umfrage_erinnerungen, wochenuebersicht
from apps.notifications.models import Notification, ParametresNotification

from .test_kalender import TERMINE, _client, _termin, _user
from .test_sitzung import UMFRAGEN, _umfrage_payload

pytestmark = pytest.mark.django_db

DIENSTE = "/api/v1/kalender/dienste/"


@pytest.fixture
def bureau():
    return _user(Role.BUREAU_ADMIN, "bureau@example.de")[0]


def _meldungen(user, typ):
    return Notification.objects.filter(destinataire=user, type_notification=typ)


def _mail_aus():
    p = ParametresNotification.get_solo()
    p.email_kalender = False
    p.save()


def _eingeladen(termin, *users, antwort=Antwort.AUSSTEHEND):
    for u in users:
        TerminEinladung.objects.create(termin=termin, user=u, antwort=antwort)


def test_termin_verschoben_meldet_eingeladene_und_helfer(bureau, mailoutbox):
    a, _ = _user(email="a@example.de")
    absager, _ = _user(email="ab@example.de")
    helfer, _ = _user(email="h@example.de")
    t = _termin(bureau, titel="Grillfest", ort="Köln")
    _eingeladen(t, a)
    _eingeladen(t, absager, antwort=Antwort.ABSAGE)
    d = Dienst.objects.create(
        termin=t, titel="Aufbau", beginn=t.beginn, benoetigt=1, erstellt_von=bureau
    )
    DienstEintragung.objects.create(dienst=d, user=helfer)

    neu = (t.beginn + timedelta(days=1)).isoformat()
    assert (
        _client(bureau).patch(f"{TERMINE}{t.pk}/", {"beginn": neu}, format="json").status_code
        == 200
    )
    assert _meldungen(a, "kalender_aenderung").count() == 1
    assert _meldungen(helfer, "kalender_aenderung").count() == 1
    assert not _meldungen(absager, "kalender_aenderung").exists()
    assert not _meldungen(bureau, "kalender_aenderung").exists()  # nicht an den Bearbeiter
    assert {m.to[0] for m in mailoutbox} == {"a@example.de", "h@example.de"}


def test_nur_ort_geaendert_und_unveraenderte_felder(bureau):
    a, _ = _user(email="a@example.de")
    t = _termin(bureau, titel="Treffen", ort="Köln")
    _eingeladen(t, a)
    c = _client(bureau)
    c.patch(f"{TERMINE}{t.pk}/", {"titel": "Treffen neu"}, format="json")
    assert not _meldungen(a, "kalender_aenderung").exists()
    c.patch(f"{TERMINE}{t.pk}/", {"ort": "Bonn"}, format="json")
    meldung = _meldungen(a, "kalender_aenderung").get()
    assert "Bonn" in meldung.message


def test_vorschlag_und_vergangener_termin_melden_nichts(bureau):
    a, _ = _user(email="a@example.de")
    vergangen = _termin(bureau, beginn=timezone.now() - timedelta(days=3))
    _eingeladen(vergangen, a)
    _client(bureau).patch(f"{TERMINE}{vergangen.pk}/", {"ort": "Bonn"}, format="json")
    entwurf = _termin(bureau, status="vorgeschlagen")
    _eingeladen(entwurf, a)
    _client(bureau).patch(f"{TERMINE}{entwurf.pk}/", {"ort": "Bonn"}, format="json")
    assert not _meldungen(a, "kalender_aenderung").exists()


def test_neu_eingeladene_bekommen_keine_aenderungsmeldung(bureau):
    a, _ = _user(email="a@example.de")
    t = _termin(bureau)
    neu = (t.beginn + timedelta(hours=2)).isoformat()
    _client(bureau).patch(
        f"{TERMINE}{t.pk}/", {"beginn": neu, "einladen": [str(a.pk)]}, format="json"
    )
    assert _meldungen(a, "kalender_einladung").count() == 1
    assert not _meldungen(a, "kalender_aenderung").exists()


def test_termin_loeschen_ist_absage(bureau, mailoutbox):
    a, _ = _user(email="a@example.de")
    t = _termin(bureau, titel="Grillfest")
    _eingeladen(t, a)
    assert _client(bureau).delete(f"{TERMINE}{t.pk}/").status_code == 204
    assert _meldungen(a, "kalender_aenderung").count() == 1
    assert len(mailoutbox) == 1


def test_mail_modulschalter_stoppt_nur_die_mail(bureau, mailoutbox):
    _mail_aus()
    a, _ = _user(email="a@example.de")
    t = _termin(bureau)
    _eingeladen(t, a)
    _client(bureau).patch(f"{TERMINE}{t.pk}/", {"ort": "Bonn"}, format="json")
    assert _meldungen(a, "kalender_aenderung").count() == 1
    assert mailoutbox == []
    a.ui_praeferenzen = {"kalender_wochenmail": True}
    a.save()
    assert wochenuebersicht() == 0


def test_absage_meldet_dem_ersteller_zusage_nicht(bureau):
    a, _ = _user(email="a@example.de")
    t = _termin(bureau)
    _eingeladen(t, a)
    c = _client(a)
    c.post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "zusage"}, format="json")
    assert not _meldungen(bureau, "kalender_antwort").exists()
    c.post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "absage"}, format="json")
    c.post(f"{TERMINE}{t.pk}/antworten/", {"antwort": "absage"}, format="json")
    assert _meldungen(bureau, "kalender_antwort").count() == 1


def test_dienst_verschoben_und_abgesagt(bureau, mailoutbox):
    a, _ = _user(email="a@example.de")
    t = _termin(bureau)
    d = Dienst.objects.create(
        termin=t,
        titel="Aufbau",
        beginn=t.beginn,
        benoetigt=1,
        erstellt_von=bureau,
        letzte_erinnerung=timezone.now(),
    )
    DienstEintragung.objects.create(dienst=d, user=a)
    neu = (t.beginn + timedelta(hours=3)).isoformat()
    assert (
        _client(bureau).patch(f"{DIENSTE}{d.pk}/", {"beginn": neu}, format="json").status_code
        == 200
    )
    d.refresh_from_db()
    assert d.letzte_erinnerung is None
    assert _meldungen(a, "kalender_aenderung").count() == 1
    assert _client(bureau).delete(f"{DIENSTE}{d.pk}/").status_code == 204
    assert _meldungen(a, "kalender_aenderung").count() == 2
    assert len(mailoutbox) == 2


def test_sprache_des_empfaengers(bureau):
    de, _ = _user(email="de@example.de")
    fr, _ = _user(email="fr@example.de")
    de.langue_preferee = "de"
    de.save()
    t = _termin(bureau, titel="Fest")
    _eingeladen(t, de, fr)
    _client(bureau).patch(f"{TERMINE}{t.pk}/", {"ort": "Bonn"}, format="json")
    assert _meldungen(de, "kalender_aenderung").get().titre == "Geändert: Fest"
    assert _meldungen(fr, "kalender_aenderung").get().titre == "Modifié : Fest"


def test_terminfindung_erinnerung_und_fristmeldung(bureau, mailoutbox):
    a, _ = _user(email="a@example.de")
    b, _ = _user(email="b@example.de")
    morgen = (timezone.localdate() + timedelta(days=1)).isoformat()
    antwort = _client(bureau).post(
        UMFRAGEN, _umfrage_payload([a, b], antwort_bis=morgen), format="json"
    )
    uid = antwort.data["id"]
    option = antwort.data["optionen"][0]["id"]
    _client(a).post(f"{UMFRAGEN}{uid}/abstimmen/", {"stimmen": {option: "ja"}}, format="json")
    mailoutbox.clear()

    assert umfrage_erinnerungen() == 1  # nur b
    assert _meldungen(b, "kalender_umfrage").filter(titre__startswith="Merci").exists()
    assert len(mailoutbox) == 1 and mailoutbox[0].to == ["b@example.de"]
    assert umfrage_erinnerungen() == 0  # am selben Tag nicht doppelt

    Terminumfrage.objects.filter(pk=uid).update(
        antwort_bis=timezone.localdate() - timedelta(days=1)
    )
    assert umfrage_erinnerungen() == 1  # Fristmeldung an den Ersteller
    assert _meldungen(bureau, "kalender_umfrage").filter(titre__startswith="Délai").exists()
    assert umfrage_erinnerungen() == 0


def test_terminfindung_alle_geantwortet_und_abbruch(bureau):
    a, _ = _user(email="a@example.de")
    b, _ = _user(email="b@example.de")
    antwort = _client(bureau).post(UMFRAGEN, _umfrage_payload([a, b]), format="json")
    uid = antwort.data["id"]
    option = antwort.data["optionen"][0]["id"]
    stimmen = {"stimmen": {option: "ja"}}
    _client(a).post(f"{UMFRAGEN}{uid}/abstimmen/", stimmen, format="json")
    assert not _meldungen(bureau, "kalender_umfrage").filter(titre__contains="répondu").exists()
    _client(b).post(f"{UMFRAGEN}{uid}/abstimmen/", stimmen, format="json")
    _client(b).post(f"{UMFRAGEN}{uid}/abstimmen/", stimmen, format="json")  # nochmal : kein Doppel
    assert _meldungen(bureau, "kalender_umfrage").filter(titre__contains="répondu").count() == 1

    assert _client(bureau).delete(f"{UMFRAGEN}{uid}/").status_code == 200
    assert _meldungen(a, "kalender_umfrage").filter(titre__startswith="Sondage").count() == 1

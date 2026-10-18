# flake8: noqa: F811
"""Regionen-Berichte, Fans-Liste und zweisprachige Mails (Release 31)."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts import tasks as konto_tasks
from apps.membres.tests.factories import MembreFactory
from apps.rbac.tests.factories import UserFactory
from apps.regionen import tasks
from apps.regionen.models import FanProfil, Reaktion, Region, Veranstaltung
from apps.regionen.tests.test_regionen import BASIS, _client, _mitglied, _verantwortlicher
from apps.regionen.tests.test_veranstaltungen import (  # noqa: F401
    _aktion,
    _neu,
    _tag,
    _url,
    _veroeffentlichen,
    buero,
    karte,
    nord,
)

pytestmark = pytest.mark.django_db

FANS = f"{BASIS}nord/fans/"
BERICHT = f"{BASIS}berichte/"


def _fan(land="HH", **kw):
    user = UserFactory(is_active=True)
    FanProfil.objects.create(
        user=user, prenom="Fanny", nom="Fan", land_de=land, datenschutz_am=timezone.now(), **kw
    )
    return user


def _anmelden(user, pk):
    return _client(user).put(_url(pk, "anmeldung/"), {}, format="json")


def _anwesend(karte, user, pk):
    return _client(karte).put(_url(pk, f"teilnehmer/{user.id}/"), {"anwesend": True}, format="json")


@pytest.fixture
def lage(karte, buero):
    """Ein abgeschlossenes Treffen von heute (Fan + Mitglied angemeldet, Fan anwesend)."""
    fan, mitglied = _fan(), _mitglied("HH")
    pk = _veroeffentlichen(karte, buero, delta=0)
    _anmelden(fan, pk)
    _anmelden(mitglied, pk)
    _anwesend(karte, fan, pk)
    assert _aktion(buero, pk, "abschliessen").status_code == 200
    return {"fan": fan, "mitglied": mitglied, "pk": pk}


class TestFansListe:
    def test_verantwortliche_sehen_namen_und_zahlen_ohne_kontaktdaten(self, karte, lage):
        r = _client(karte).get(FANS)
        assert r.status_code == 200
        assert (r.data["gesamt"], r.data["fans"], r.data["mitglieder"]) == (2, 1, 1)
        fan = next(e for e in r.data["ergebnisse"] if e["art"] == "fan")
        assert fan["name"] == "Fanny Fan"
        assert (fan["anmeldungen"], fan["teilnahmen"], fan["reaktionen"]) == (1, 1, 0)
        assert set(fan) == {
            "user",
            "name",
            "art",
            "anmeldungen",
            "teilnahmen",
            "reaktionen",
            "letzte_aktivitaet",
        }
        assert lage["fan"].email not in str(r.data)

    def test_zugriff_nur_verantwortliche_der_region_und_buero(self, karte, buero, lage):
        assert _client(buero).get(FANS).status_code == 200
        assert _client(_mitglied("HH")).get(FANS).status_code == 403
        assert _client(lage["fan"]).get(FANS).status_code == 403
        anderer = _mitglied("NW")
        _verantwortlicher(Region.objects.get(slug="nrw"), anderer)
        assert _client(anderer).get(FANS).status_code == 403
        assert _client().get(FANS).status_code in (401, 403)

    def test_suche_filter_und_seiten(self, karte, lage):
        assert _client(karte).get(FANS, {"art": "fan"}).data["gesamt"] == 1
        assert _client(karte).get(FANS, {"q": "fanny"}).data["gesamt"] == 1
        assert _client(karte).get(FANS, {"q": "zzz"}).data["gesamt"] == 0
        seite = _client(karte).get(FANS, {"limit": 1, "offset": 1}).data
        assert seite["gesamt"] == 2 and len(seite["ergebnisse"]) == 1
        assert _client(karte).get(FANS, {"limit": "x"}).status_code == 400

    def test_reaktionen_zaehlen_und_abgesagte_treffen_nicht(self, karte, buero, lage):
        from apps.regionen.models import Beitrag

        beitrag = Beitrag.objects.create(
            region=Region.objects.get(slug="nord"), titel="T", text="x", autor=karte
        )
        Reaktion.objects.create(beitrag=beitrag, user=lage["fan"], art="herz")
        pk2 = _veroeffentlichen(karte, buero, delta=5)
        neuer = _fan()
        _anmelden(neuer, pk2)
        assert _aktion(buero, pk2, "absagen").status_code == 200
        daten = _client(karte).get(FANS).data
        fan = next(e for e in daten["ergebnisse"] if e["name"] == "Fanny Fan" and e["reaktionen"])
        assert fan["reaktionen"] == 1
        assert daten["gesamt"] == 2  # der nur für das abgesagte Treffen Angemeldete fehlt

    def test_aktivitaeten_einer_person(self, karte, lage):
        r = _client(karte).get(f"{FANS}{lage['fan'].id}/")
        assert r.status_code == 200 and r.data["art"] == "fan"
        v = r.data["veranstaltungen"][0]
        assert v["anwesend"] is True and v["abgeschlossen"] is True
        assert _client(karte).get(f"{FANS}{UserFactory().id}/").status_code == 404
        assert _client(_mitglied("HH")).get(f"{FANS}{lage['fan'].id}/").status_code == 403


class TestBericht:
    def test_buero_sieht_kennzahlen_je_region_und_gesamt(self, buero, lage):
        r = _client(buero).get(BERICHT)
        assert r.status_code == 200
        nord = next(x for x in r.data["regionen"] if x["slug"] == "nord")
        assert (nord["treffen"], nord["anmeldungen"], nord["anwesende"]) == (1, 2, 1)
        assert nord["anwesenheitsquote"] == 50
        assert (nord["fans_gesamt"], nord["fans_mitglieder"]) == (2, 1)
        assert nord["fans_ohne_mitgliedschaft"] == 1 and nord["fans_neu"] == 2
        assert nord["fans_aktiv"] == 2
        assert r.data["gesamt"]["fans_gesamt"] == 2
        sued = next(x for x in r.data["regionen"] if x["slug"] == "nrw")
        assert sued["treffen"] == 0 and sued["anwesenheitsquote"] is None

    def test_zeitraum_begrenzt_die_zahlen(self, buero, lage):
        alt = (timezone.localdate() - datetime.timedelta(days=60)).isoformat()
        r = _client(buero).get(BERICHT, {"von": alt, "bis": alt})
        assert r.data["gesamt"]["treffen"] == 0 and r.data["gesamt"]["fans_gesamt"] == 0

    def test_fan_wird_mitglied(self, buero):
        from apps.membres.models import StatutMembre

        fan = _fan(mitgliedsantrag_am=timezone.now())
        MembreFactory(user=fan, land_de="HH", statut=StatutMembre.ACTIF)
        r = _client(buero).get(BERICHT)
        assert r.data["gesamt"]["fan_zu_mitglied"] == 1
        assert next(x for x in r.data["regionen"] if x["slug"] == "nord")["fan_zu_mitglied"] == 1

    def test_rechte_und_eingaben(self, karte, buero, lage):
        assert _client(karte).get(BERICHT).status_code == 403
        assert _client(lage["fan"]).get(BERICHT).status_code == 403
        assert _client(buero).get(BASIS).data["darf_berichte"] is True
        assert _client(karte).get(BASIS).data["darf_berichte"] is False
        assert _client(buero).get(BERICHT, {"von": "heute"}).status_code == 400
        assert (
            _client(buero).get(BERICHT, {"von": "2026-02-01", "bis": "2026-01-01"}).status_code
            == 400
        )
        assert (
            _client(buero).get(BERICHT, {"von": "2020-01-01", "bis": "2026-01-01"}).status_code
            == 400
        )

    def test_csv_export(self, buero, lage):
        r = _client(buero).get(f"{BERICHT}export/")
        assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
        text = r.content.decode("utf-8-sig")
        zeilen = text.splitlines()
        assert zeilen[1].startswith("Sektor;Treffen abgeschlossen")
        assert any(z.startswith("Nord;1;") for z in zeilen)
        assert zeilen[-1].startswith("Gesamt;")
        assert _client(lage["fan"]).get(f"{BERICHT}export/").status_code == 403


class TestMails:
    def _zweisprachig(self, mail):
        text = mail.body
        return mail.subject.count("·") == 1 and "———" in text

    def test_anmeldebestaetigung_ist_zweisprachig(self, karte, buero, mailoutbox):
        pk = _veroeffentlichen(karte, buero)
        mailoutbox.clear()
        fan = _fan()
        assert _anmelden(fan, pk).status_code == 200
        assert len(mailoutbox) == 1 and mailoutbox[0].to == [fan.email]
        assert self._zweisprachig(mailoutbox[0])
        assert "Anmeldung bestätigt" in mailoutbox[0].body
        assert "Inscription confirmée" in mailoutbox[0].body
        assert "Hamburg, Kneipe X" in mailoutbox[0].body
        _anmelden(fan, pk)  # erneute Anmeldung : keine zweite Mail
        assert len(mailoutbox) == 1

    def test_freigabe_und_absage_gehen_per_mail_an_die_betroffenen(self, karte, buero, mailoutbox):
        neu = _neu(karte)
        pk = neu.data["id"]
        mailoutbox.clear()
        _aktion(karte, pk, "einreichen")
        assert any(buero.email in m.to for m in mailoutbox)  # Büro wird informiert
        mailoutbox.clear()
        _aktion(buero, pk, "freigeben")
        assert [m.to for m in mailoutbox] == [[karte.email]]
        assert self._zweisprachig(mailoutbox[0])
        fan = _fan()
        _anmelden(fan, pk)
        mailoutbox.clear()
        _aktion(buero, pk, "absagen")
        assert [m.to for m in mailoutbox] == [[fan.email]]
        assert (
            "Veranstaltung abgesagt" in mailoutbox[0].body
            and "Réunion annulée" in mailoutbox[0].body
        )

    def test_mailfehler_bricht_die_aktion_nicht_ab(self, karte, buero, settings):
        settings.EMAIL_BACKEND = "django.core.mail.backends.dummy.NonExistent"
        pk = _veroeffentlichen(karte, buero)
        assert _anmelden(_fan(), pk).status_code == 200

    def test_erinnerung_am_vortag_nur_einmal(self, karte, buero, mailoutbox):
        pk = _veroeffentlichen(karte, buero, delta=1)
        fan = _fan()
        _anmelden(fan, pk)
        _veroeffentlichen(karte, buero, delta=3)  # anderer Tag : keine Erinnerung
        mailoutbox.clear()
        assert tasks.erinnere_teilnehmer() == 1
        assert mailoutbox[0].to == [fan.email] and "Rappel" in mailoutbox[0].body
        assert Veranstaltung.objects.get(pk=pk).erinnert_am is not None
        assert tasks.erinnere_teilnehmer() == 0 and len(mailoutbox) == 1

    def test_kontomails_sind_zweisprachig(self, mailoutbox):
        user = UserFactory()
        konto_tasks.send_otp_email(user.id, "123456")
        konto_tasks.send_email_verification_code(user.id, "654321")
        konto_tasks.send_password_reset_email(user.id, "tok")
        konto_tasks.send_welcome_email(user.id)
        konto_tasks.send_registration_refused_email(user.id)
        konto_tasks.send_new_ip_alert_email(user.id, "1.2.3.4")
        konto_tasks.send_registration_approved_email(user.id)
        assert len(mailoutbox) == 7
        for m in mailoutbox:
            assert "·" in m.subject and "———" in m.body
        assert "123456" in mailoutbox[0].body and "654321" in mailoutbox[1].body
        assert "/reset-password?token=tok" in mailoutbox[2].body

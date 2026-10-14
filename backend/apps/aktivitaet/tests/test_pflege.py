"""Datenpflege (Release 25) : Fristen, Vorschau, automatischer und manueller Löschlauf."""

from datetime import timedelta

import pytest
from axes.models import AccessAttempt, AccessFailureLog, AccessLog
from django.contrib.sessions.models import Session
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.aktivitaet import pflege
from apps.aktivitaet.models import (
    Auffaelligkeit,
    Monatsbericht,
    Nutzung,
    Pflegeeinstellung,
    RechteReview,
)
from apps.aktivitaet.tasks import aktivitaet_bereinigen
from apps.notifications.models import Notification, TypeNotification
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN, langue_preferee="de")


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _alt(modell, tage, feld="created_at", **kwargs):
    obj = modell.objects.create(**kwargs)
    modell.objects.filter(pk=obj.pk).update(**{feld: timezone.now() - timedelta(days=tage)})
    return obj


def _hinweis(user, lu, tage):
    return _alt(
        Notification,
        tage,
        destinataire=user,
        type_notification=TypeNotification.AKTIVITAET_BERICHT,
        titre="t",
        message="m",
        lu=lu,
    )


class TestArten:
    def test_jede_art_hat_sinnvolle_grenzen(self):
        for art in pflege.ARTEN.values():
            assert art.minimum <= art.standard <= pflege.MAXIMUM_TAGE, art.key
            assert art.fest or art.minimum > 0, art.key

    def test_standard_entspricht_den_bisherigen_journalfristen(self):
        assert pflege.frist(pflege.ARTEN["journal.anmeldung"]) == 180
        assert pflege.frist(pflege.ARTEN["journal.finanzen"]) == 730
        assert pflege.frist(pflege.ARTEN["ip"]) == 90

    def test_gespeicherte_frist_wird_auf_das_minimum_angehoben(self):
        e = pflege.einstellung()
        e.fristen = {"journal.finanzen": 5, "nutzung": "kaputt"}
        e.save()
        assert pflege.frist(pflege.ARTEN["journal.finanzen"], e) == 365
        assert pflege.frist(pflege.ARTEN["nutzung"], e) == 400

    def test_feste_art_hat_keine_frist(self):
        assert pflege.frist(pflege.ARTEN["sitzungen"]) == 0


class TestLauf:
    def test_loescht_nur_jenseits_der_frist(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        _alt(AuditLogEntry, 10, action="login_success", user=admin)
        _alt(AuditLogEntry, 400, action="finanz_xyz")  # unbekannt → sonstige, 730 Tage
        ergebnis = pflege.ausfuehren()
        assert ergebnis["journal.anmeldung"] == 1
        assert ergebnis["journal.sonstige"] == 0
        assert AuditLogEntry.objects.filter(action="login_success").count() == 1
        assert AuditLogEntry.objects.filter(action="finanz_xyz").count() == 1

    def test_eigene_frist_gilt(self, admin):
        _alt(AuditLogEntry, 60, action="login_success", user=admin)
        e = pflege.einstellung()
        e.fristen = {"journal.anmeldung": 30}
        e.save()
        assert pflege.ausfuehren()["journal.anmeldung"] == 1

    def test_ip_wird_entfernt_aber_eintrag_bleibt(self, admin):
        _alt(AuditLogEntry, 100, action="login_success", user=admin, ip_address="1.2.3.4")
        pflege.ausfuehren(["ip"])
        e = AuditLogEntry.objects.get(action="login_success")
        assert e.ip_address is None and e.user_agent == ""

    def test_auffaelligkeiten_nur_erledigte(self):
        _alt(
            Auffaelligkeit,
            800,
            "erkannt_am",
            regel="bruteforce",
            schluessel="a",
            status=Auffaelligkeit.Status.ERLEDIGT,
        )
        _alt(Auffaelligkeit, 800, "erkannt_am", regel="bruteforce", schluessel="b")
        pflege.ausfuehren(["auffaelligkeiten"])
        assert list(Auffaelligkeit.objects.values_list("schluessel", flat=True)) == ["b"]

    def test_nutzung_berichte_und_reviews(self, admin):
        heute = timezone.localdate()
        Nutzung.objects.create(user=admin, tag=heute - timedelta(days=500), modul="membres")
        Nutzung.objects.create(user=admin, tag=heute - timedelta(days=5), modul="membres")
        _alt(Monatsbericht, 1500, "erstellt_am", jahr=2022, monat=1)
        _alt(Monatsbericht, 30, "erstellt_am", jahr=2026, monat=9)
        _alt(
            RechteReview,
            1500,
            "abgeschlossen_am",
            quartal="2022-Q1",
            status=RechteReview.Status.ABGESCHLOSSEN,
        )
        RechteReview.objects.create(quartal="2022-Q2")  # offen → nie löschen
        ergebnis = pflege.ausfuehren(["nutzung", "berichte", "reviews"])
        assert ergebnis == {"nutzung": 1, "berichte": 1, "reviews": 1}
        assert RechteReview.objects.filter(quartal="2022-Q2").exists()

    def test_benachrichtigungen_gelesen_und_ungelesen(self, admin):
        _hinweis(admin, True, 200)
        _hinweis(admin, True, 20)
        _hinweis(admin, False, 200)  # ungelesen : erst nach 730 Tagen
        _hinweis(admin, False, 800)
        ergebnis = pflege.ausfuehren(["hinweise_gelesen", "hinweise_ungelesen"])
        assert ergebnis == {"hinweise_gelesen": 1, "hinweise_ungelesen": 1}
        assert Notification.objects.count() == 2

    def test_axes_und_sitzungen(self):
        alt = timezone.now() - timedelta(days=200)
        for modell in (AccessFailureLog, AccessLog):
            o = modell.objects.create(user_agent="x", http_accept="", path_info="/")
            modell.objects.filter(pk=o.pk).update(attempt_time=alt)
            modell.objects.create(user_agent="y", http_accept="", path_info="/")
        Session.objects.create(
            session_key="abgelaufen", session_data="x", expire_date=timezone.now() - timedelta(1)
        )
        Session.objects.create(
            session_key="gueltig", session_data="x", expire_date=timezone.now() + timedelta(1)
        )
        ergebnis = pflege.ausfuehren(["axes_fehler", "axes_log", "sitzungen"])
        assert ergebnis == {"axes_fehler": 1, "axes_log": 1, "sitzungen": 1}
        assert AccessFailureLog.objects.count() == 1 and AccessLog.objects.count() == 1
        assert list(Session.objects.values_list("session_key", flat=True)) == ["gueltig"]
        assert AccessAttempt.objects.count() == 0

    def test_lauf_merkt_sich_das_ergebnis(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        pflege.lauf("manuell", user=admin)
        e = Pflegeeinstellung.objects.get()
        assert e.letzter_lauf_modus == "manuell" and e.letzter_lauf_von == admin
        assert e.letzter_lauf_ergebnis == {"journal.anmeldung": 1}

    def test_vorschau_zaehlt_ohne_zu_loeschen(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        eintrag = {a["key"]: a for a in pflege.vorschau()}["journal.anmeldung"]
        assert eintrag["betroffen"] == 1 and eintrag["gesamt"] == 1 and eintrag["aeltester"]
        assert AuditLogEntry.objects.filter(action="login_success").count() == 1


class TestTask:
    def test_ausgeschaltet_loescht_nichts(self, admin):
        _alt(AuditLogEntry, 400, action="login_success", user=admin)
        e = pflege.einstellung()
        e.automatisch = False
        e.save()
        assert aktivitaet_bereinigen() == {"geloescht": 0, "ip_entfernt": 0}
        assert AuditLogEntry.objects.filter(action="login_success").exists()

    def test_eingeschaltet_loescht_und_protokolliert(self, admin):
        _alt(AuditLogEntry, 400, action="login_success", user=admin)
        assert aktivitaet_bereinigen()["geloescht"] == 1
        assert AuditLogEntry.objects.filter(action="aktivitaet_bereinigt").count() == 1


class TestApi:
    url = "/api/v1/aktivitaet/pflege/"

    def test_nur_app_admin(self):
        assert _client().get(self.url).status_code in (401, 403)
        assert _client(UserFactory(role=Role.BUREAU_ADMIN)).get(self.url).status_code == 403

    def test_get_liefert_arten_mit_vorschau(self, admin):
        r = _client(admin).get(self.url)
        assert r.status_code == 200
        assert r.data["automatisch"] is True and r.data["letzter_lauf"] is None
        keys = [a["key"] for a in r.data["arten"]]
        assert "journal.anmeldung" in keys and "sitzungen" in keys
        art = next(a for a in r.data["arten"] if a["key"] == "nutzung")
        assert (art["frist"], art["minimum"], art["standard"]) == (400, 100, 400)

    def test_fristen_und_schalter_speichern_und_protokollieren(self, admin):
        r = _client(admin).put(
            self.url, {"automatisch": False, "fristen": {"nutzung": 200}}, format="json"
        )
        assert r.status_code == 200 and r.data["automatisch"] is False
        assert next(a for a in r.data["arten"] if a["key"] == "nutzung")["frist"] == 200
        assert AuditLogEntry.objects.filter(action="datenpflege_geaendert").count() == 1

    def test_standard_wird_nicht_gespeichert_und_null_setzt_zurueck(self, admin):
        c = _client(admin)
        c.put(self.url, {"fristen": {"nutzung": 200}}, format="json")
        c.put(self.url, {"fristen": {"nutzung": None}}, format="json")
        assert pflege.einstellung().fristen == {}
        c.put(self.url, {"fristen": {"nutzung": 400}}, format="json")
        assert pflege.einstellung().fristen == {}

    @pytest.mark.parametrize(
        "body",
        [
            {"fristen": {"nutzung": 99}},
            {"fristen": {"nutzung": 99999}},
            {"fristen": {"nutzung": "200"}},
            {"fristen": {"nutzung": True}},
            {"fristen": {"gibt_es_nicht": 200}},
            {"fristen": {"sitzungen": 5}},
            {"fristen": [1]},
            {"automatisch": "ja"},
        ],
    )
    def test_ungueltige_eingaben(self, admin, body):
        assert _client(admin).put(self.url, body, format="json").status_code == 400
        assert pflege.einstellung().fristen == {}

    def test_unveraendert_wird_nicht_protokolliert(self, admin):
        _client(admin).put(self.url, {"automatisch": True, "fristen": {}}, format="json")
        assert not AuditLogEntry.objects.filter(action="datenpflege_geaendert").exists()

    def test_ausfuehren_braucht_bestaetigung(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        r = _client(admin).post(self.url + "ausfuehren/", {}, format="json")
        assert r.status_code == 400
        assert AuditLogEntry.objects.filter(action="login_success").exists()

    def test_ausfuehren_ausgewaehlte_arten(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        _hinweis(admin, True, 200)
        r = _client(admin).post(
            self.url + "ausfuehren/",
            {"bestaetigt": True, "arten": ["hinweise_gelesen"]},
            format="json",
        )
        assert r.status_code == 200 and r.data["summe"] == 1
        assert r.data["ergebnis"] == {"hinweise_gelesen": 1}
        assert r.data["letzter_lauf"]["modus"] == "manuell"
        assert AuditLogEntry.objects.filter(action="login_success").exists()
        log = AuditLogEntry.objects.get(action="datenpflege_manuell")
        assert log.metadata["summe"] == 1 and log.user == admin

    def test_ausfuehren_alle_arten(self, admin):
        _alt(AuditLogEntry, 200, action="login_success", user=admin)
        r = _client(admin).post(self.url + "ausfuehren/", {"bestaetigt": True}, format="json")
        assert r.status_code == 200 and r.data["ergebnis"]["journal.anmeldung"] == 1

    @pytest.mark.parametrize("arten", [[], "nutzung", ["gibt_es_nicht"]])
    def test_ausfuehren_ungueltige_auswahl(self, admin, arten):
        r = _client(admin).post(
            self.url + "ausfuehren/", {"bestaetigt": True, "arten": arten}, format="json"
        )
        assert r.status_code == 400

    def test_aktionenliste_zeigt_wirksame_frist(self, admin):
        _client(admin).put(self.url, {"fristen": {"journal.anmeldung": 60}}, format="json")
        r = _client(admin).get("/api/v1/aktivitaet/aktionen/")
        k = next(k for k in r.data["kategorien"] if k["key"] == "anmeldung")
        assert k["aufbewahrung_tage"] == 60

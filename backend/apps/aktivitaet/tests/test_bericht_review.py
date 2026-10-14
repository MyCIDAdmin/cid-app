"""Release 24 — Monatsbericht und vierteljährliche Rechteprüfung."""

from datetime import datetime, timedelta

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.aktivitaet import bericht, regeln, review
from apps.aktivitaet.models import (
    Auffaelligkeit,
    Monatsbericht,
    Nutzung,
    RechtePosition,
    RechteReview,
)
from apps.aktivitaet.services import BERLIN
from apps.aktivitaet.tasks import monatsbericht_senden, rechte_review_anlegen
from apps.notifications.models import Notification, ParametresNotification, TypeNotification
from apps.rbac.models import RoleDefinition, UserRoleAssignment
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN, email="admin@example.org", langue_preferee="de")


def _eintrag(aktion, jahr=2026, monat=9, tag=10, n=1, user=None, **meta):
    for _ in range(n):
        e = AuditLogEntry.objects.create(action=aktion, user=user, metadata=meta)
        AuditLogEntry.objects.filter(pk=e.pk).update(
            created_at=datetime(jahr, monat, tag, 12, tzinfo=BERLIN)
        )


class TestBericht:
    def test_zeitraum_und_vormonat(self):
        start, ende = bericht.zeitraum(2026, 12)
        assert (start.month, ende.year, ende.month) == (12, 2027, 1)
        jetzt = datetime(2026, 1, 1, 7, tzinfo=BERLIN)
        assert bericht.vormonat(jetzt) == (2025, 12)

    def test_kennzahlen_nur_des_monats(self):
        u = UserFactory()
        _eintrag("login_success", n=3, user=u)
        _eintrag("login_failed", n=2)
        _eintrag("login_success", monat=8, n=5, user=u)  # anderer Monat
        _eintrag("membres_geaendert", n=4, user=u)
        _eintrag("boutique_geloescht", n=1, user=u)
        _eintrag("membres_export", n=2, user=u)
        _eintrag("server_fehler", n=3)
        d = bericht.berechnen(2026, 9)
        assert d["sicherheit"]["logins"] == 3 and d["sicherheit"]["fehlversuche"] == 2
        assert d["aenderungen"]["mitglieder"] == 4 + 0  # export zählt separat
        assert d["aenderungen"]["loeschungen"] == 1 and d["aenderungen"]["exporte"] == 2
        assert d["betrieb"]["server_fehler"] == 3

    def test_auffaelligkeiten_und_nutzung(self):
        Auffaelligkeit.objects.create(
            regel="bruteforce",
            schluessel="a",
            gewicht="wichtig",
            erkannt_am=datetime(2026, 9, 5, tzinfo=BERLIN),
        )
        a, b = UserFactory(), UserFactory()
        Nutzung.objects.create(user=a, modul="membres", tag=datetime(2026, 9, 3).date())
        Nutzung.objects.create(user=b, modul="membres", tag=datetime(2026, 9, 4).date())
        d = bericht.berechnen(2026, 9)
        assert d["auffaelligkeiten"] == {"neu": 1, "wichtig": 1, "offen": 1}
        assert d["nutzung"]["aktive"] == 2
        assert d["nutzung"]["module"] == [{"modul": "membres", "nutzer": 2}]
        assert "kalender" in d["nutzung"]["ungenutzt"]

    def test_keine_personen_im_bericht(self):
        u = UserFactory(email="geheim@example.org")
        _eintrag("login_success", user=u)
        assert "geheim" not in str(bericht.berechnen(2026, 9))

    def test_erstellen_ist_wiederholbar(self):
        bericht.erstellen(2026, 9)
        _eintrag("login_success", n=2, user=UserFactory())
        bericht.erstellen(2026, 9)
        assert Monatsbericht.objects.count() == 1
        assert Monatsbericht.objects.get().daten["sicherheit"]["logins"] == 2

    def test_texte_de_und_fr(self):
        d = bericht.berechnen(2026, 9)
        assert bericht.zeilen(d, "de")[0].startswith("Sicherheit")
        assert bericht.zeilen(d, "fr")[0].startswith("Sécurité")
        assert len(bericht.zeilen(d, "de")) == len(bericht.zeilen(d, "fr")) == 6

    def test_senden_glocke_mail_und_abschaltung(self, admin):
        b = bericht.erstellen(2026, 9)
        assert bericht.senden(b) == 1
        assert (
            Notification.objects.filter(
                destinataire=admin, type_notification=TypeNotification.AKTIVITAET_BERICHT
            ).count()
            == 1
        )
        assert len(mail.outbox) == 1 and "09/2026" in mail.outbox[0].subject
        b.refresh_from_db()
        assert b.versendet_am is not None
        mail.outbox.clear()
        p = ParametresNotification.get_solo()
        p.email_aktivitaet = False
        p.save()
        bericht.senden(b)
        assert mail.outbox == []

    def test_task_erstellt_vormonat_und_sendet(self, admin):
        r = monatsbericht_senden()
        jahr, monat = bericht.vormonat()
        assert (r["jahr"], r["monat"], r["empfaenger"]) == (jahr, monat, 1)
        assert AuditLogEntry.objects.filter(action="monatsbericht_gesendet").exists()


class TestReview:
    def test_quartal(self):
        assert review.quartal_von(datetime(2026, 10, 14, tzinfo=BERLIN)) == "2026-Q4"
        assert review.quartal_von(datetime(2026, 3, 31, tzinfo=BERLIN)) == "2026-Q1"

    def test_positionen_nur_privilegierte_und_eigene_rollen(self, admin):
        bureau = UserFactory(role=Role.BUREAU_ADMIN)
        UserFactory(role=Role.MEMBRE)  # normales Mitglied : nicht dabei
        helfer = UserFactory(role=Role.MEMBRE)
        eigene = RoleDefinition.objects.create(slug="kasse", nom="Kasse", is_system=False)
        UserRoleAssignment.objects.create(user=helfer, role=eigene)
        UserFactory(role=Role.BUREAU_ADMIN, is_active=False)  # inaktiv : nicht dabei
        r, neu = review.anlegen("2026-Q4")
        assert neu
        emails = set(r.positionen.values_list("email", flat=True))
        assert emails == {admin.email, bureau.email, helfer.email}
        assert "Kasse" in r.positionen.get(email=helfer.email).rolle

    def test_anlegen_ist_idempotent(self, admin):
        review.anlegen("2026-Q4")
        r, neu = review.anlegen("2026-Q4")
        assert not neu and RechteReview.objects.count() == 1 and r.positionen.count() == 1

    def test_task_meldet_admins_nur_einmal(self, admin):
        assert rechte_review_anlegen()["neu"] is True
        assert rechte_review_anlegen()["neu"] is False
        assert (
            Notification.objects.filter(
                destinataire=admin, type_notification=TypeNotification.AKTIVITAET_REVIEW
            ).count()
            == 1
        )

    def test_regel_review_offen_nach_14_tagen(self, admin):
        r, _ = review.anlegen("2026-Q4")
        assert "review_offen" not in {f["regel"] for f in regeln.pruefen(timezone.now())}
        RechteReview.objects.filter(pk=r.pk).update(erstellt_am=timezone.now() - timedelta(days=15))
        funde = [f for f in regeln.pruefen(timezone.now()) if f["regel"] == "review_offen"]
        assert len(funde) == 1 and funde[0]["details"]["offen"] == 1
        assert "2026-Q4" in regeln.text_von("review_offen", funde[0]["details"])["de"]


class TestApi:
    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_nur_app_admin(self):
        c = self._client(UserFactory(role=Role.BUREAU_ADMIN))
        assert c.get("/api/v1/aktivitaet/berichte/").status_code == 403
        assert c.get("/api/v1/aktivitaet/review/").status_code == 403

    def test_bericht_erzeugen_lesen_senden(self, admin):
        c = self._client(admin)
        jahr, monat = bericht.vormonat()
        assert c.get(f"/api/v1/aktivitaet/berichte/{jahr}/{monat}/").status_code == 404
        r = c.post(f"/api/v1/aktivitaet/berichte/{jahr}/{monat}/erzeugen/")
        assert r.status_code == 200 and "sicherheit" in r.json()["daten"]
        liste = c.get("/api/v1/aktivitaet/berichte/").json()
        assert [(b["jahr"], b["monat"]) for b in liste["ergebnisse"]] == [(jahr, monat)]
        assert c.post(f"/api/v1/aktivitaet/berichte/{jahr}/{monat}/senden/").status_code == 200
        assert len(mail.outbox) == 1 and mail.outbox[0].to == ["admin@example.org"]
        assert Monatsbericht.objects.get().versendet_am is None  # „an mich“ ist kein Rundversand

    def test_laufender_monat_kann_nicht_berichtet_werden(self, admin):
        heute = timezone.localdate(timezone.now(), BERLIN)
        r = self._client(admin).post(
            f"/api/v1/aktivitaet/berichte/{heute.year}/{heute.month}/erzeugen/"
        )
        assert r.status_code == 400

    def test_review_ablauf(self, admin):
        zweiter = UserFactory(role=Role.BUREAU_ADMIN)
        c = self._client(admin)
        r = c.post("/api/v1/aktivitaet/review/")
        assert r.status_code == 201 and r.json()["anzahl"] == 2
        assert c.post("/api/v1/aktivitaet/review/").status_code == 200  # schon vorhanden
        rid = r.json()["id"]
        pos = {
            p["email"]: p for p in c.get(f"/api/v1/aktivitaet/review/{rid}/").json()["positionen"]
        }
        assert c.post(f"/api/v1/aktivitaet/review/{rid}/abschliessen/").status_code == 400

        url = "/api/v1/aktivitaet/review/{}/positionen/{}/"
        assert (
            c.post(
                url.format(rid, pos[admin.email]["id"]), {"entscheidung": "bestaetigt"}
            ).status_code
            == 200
        )
        assert (
            c.post(url.format(rid, pos[zweiter.email]["id"]), {"entscheidung": "x"}).status_code
            == 400
        )
        ok = c.post(
            url.format(rid, pos[zweiter.email]["id"]),
            {"entscheidung": "entziehen", "notiz": "nicht mehr im Bureau"},
        )
        assert ok.status_code == 200 and ok.json()["aktuell_erweitert"] is True

        fertig = c.post(f"/api/v1/aktivitaet/review/{rid}/abschliessen/")
        assert fertig.status_code == 200 and fertig.json()["status"] == "abgeschlossen"
        e = AuditLogEntry.objects.get(action="rechte_review_abgeschlossen")
        assert e.metadata["entziehen"] == 1 and e.metadata["entzug_noch_offen"] == 1
        # abgeschlossen : keine Änderungen mehr
        assert (
            c.post(
                url.format(rid, pos[admin.email]["id"]), {"entscheidung": "entziehen"}
            ).status_code
            == 400
        )

    def test_nach_entzug_ist_konto_nicht_mehr_erweitert(self, admin):
        zweiter = UserFactory(role=Role.BUREAU_ADMIN)
        r, _ = review.anlegen("2026-Q4")
        p = RechtePosition.objects.get(review=r, user=zweiter)
        zweiter.role = Role.MEMBRE
        zweiter.save()
        assert review.position_dict(p)["aktuell_erweitert"] is False

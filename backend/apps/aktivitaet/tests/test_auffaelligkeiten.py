"""Release 22 — Auffälligkeitsregeln, Alarme, Betriebsfehler."""

import smtplib
from datetime import timedelta
from types import SimpleNamespace
from unittest import mock

import pytest
from celery.signals import task_failure
from django.contrib.auth.models import AnonymousUser
from django.core import mail
from django.http import HttpResponse
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.aktivitaet import alarm, regeln
from apps.aktivitaet.middleware import AktivitaetMiddleware
from apps.aktivitaet.models import Auffaelligkeit
from apps.aktivitaet.services import bereinigen, uebersicht
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import Notification, ParametresNotification, TypeNotification
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN, email="admin@example.org", langue_preferee="de")


def _eintraege(aktion, n, user=None, ip="10.0.0.9", minuten=1, **meta):
    for _ in range(n):
        e = AuditLogEntry.objects.create(action=aktion, user=user, ip_address=ip, metadata=meta)
        AuditLogEntry.objects.filter(pk=e.pk).update(
            created_at=timezone.now() - timedelta(minutes=minuten)
        )


def _regeln():
    return {f["regel"] for f in regeln.pruefen(timezone.now())}


class TestRegeln:
    def test_bruteforce_ab_zehn_versuchen(self):
        _eintraege("login_failed", 9)
        assert "bruteforce" not in _regeln()
        _eintraege("login_failed", 1)
        funde = [f for f in regeln.pruefen(timezone.now()) if f["regel"] == "bruteforce"]
        assert len(funde) == 1 and funde[0]["details"]["n"] == 10
        assert funde[0]["details"]["ip"] == "10.0.0.9"

    def test_alte_fehlversuche_zaehlen_nicht(self):
        _eintraege("login_failed", 12, minuten=60)
        assert "bruteforce" not in _regeln()

    def test_erfolg_nach_fehlversuchen(self):
        opfer = UserFactory()
        _eintraege("login_failed", 5, user=opfer, minuten=5)
        _eintraege("login_success", 1, user=opfer, minuten=1)
        assert "angriff_erfolg" in _regeln()

    def test_erfolg_ohne_fehlversuche_ist_normal(self):
        _eintraege("login_success", 1, user=UserFactory())
        assert "angriff_erfolg" not in _regeln()

    def test_neuer_app_admin(self):
        ziel = UserFactory()
        _eintraege("role_changed", 1, user=ziel, nouveau_role=Role.SUPER_ADMIN)
        _eintraege("role_changed", 1, user=UserFactory(), nouveau_role="membre")
        funde = [f for f in regeln.pruefen(timezone.now()) if f["regel"] == "neuer_app_admin"]
        assert len(funde) == 1 and funde[0]["user"] == ziel and funde[0]["gewicht"] == "wichtig"

    def test_exporthaeufung_und_loeschwelle(self):
        u = UserFactory()
        _eintraege("membres_export", 3, user=u)
        _eintraege("membres_geloescht", 10, user=u)
        assert {"export_haeufung", "massen_loeschung"} <= _regeln()

    def test_wenige_exporte_sind_normal(self):
        _eintraege("membres_export", 2, user=UserFactory())
        assert "export_haeufung" not in _regeln()

    def test_abschluss_und_totp(self):
        u = UserFactory()
        _eintraege("finances_wiedereroeffnet", 1, user=u)
        _eintraege("totp_disabled", 1, user=u)
        assert {"abschluss_geoeffnet", "totp_deaktiviert"} <= _regeln()

    def test_serverfehler_und_task_fehler(self):
        _eintraege("server_fehler", 5, ip=None)
        _eintraege("task_fehlgeschlagen", 4, ip=None, task="apps.x.tasks.y")
        funde = regeln.pruefen(timezone.now())
        assert {"server_fehler", "task_fehler"} <= {f["regel"] for f in funde}
        assert sum(f["regel"] == "task_fehler" for f in funde) == 1  # je Job und Stunde einmal

    def test_texte_zweisprachig(self):
        text = regeln.text_von("bruteforce", {"n": 12, "ip": "1.2.3.4", "minuten": 15})
        assert "1.2.3.4" in text["de"] and "1.2.3.4" in text["fr"] and text["de"] != text["fr"]

    def test_jede_regel_hat_text_und_gewicht(self):
        for regel, (gewicht, de, fr) in regeln.REGELN.items():
            assert gewicht in ("warnung", "wichtig") and de and fr


class TestAlarm:
    def test_einmal_gemeldet(self, admin):
        _eintraege("login_failed", 10)
        assert alarm.lauf() == {"neu": 1, "empfaenger": 1}
        assert alarm.lauf() == {"neu": 0, "empfaenger": 0}
        assert Auffaelligkeit.objects.count() == 1
        n = Notification.objects.filter(
            destinataire=admin, type_notification=TypeNotification.AKTIVITAET_AUFFAELLIGKEIT
        )
        assert n.count() == 1 and "10.0.0.9" in n.get().message
        assert len(mail.outbox) == 1 and mail.outbox[0].to == ["admin@example.org"]

    def test_mail_abschaltbar_glocke_bleibt(self, admin):
        p = ParametresNotification.get_solo()
        p.email_aktivitaet = False
        p.save()
        _eintraege("login_failed", 10)
        alarm.lauf()
        assert mail.outbox == []
        assert Notification.objects.filter(destinataire=admin).count() == 1

    def test_nur_app_admins_werden_benachrichtigt(self, admin):
        bureau = UserFactory(role=Role.BUREAU_ADMIN)
        _eintraege("login_failed", 10)
        alarm.lauf()
        assert not Notification.objects.filter(destinataire=bureau).exists()

    def test_franzoesisch_fuer_fr_admin(self):
        fr = UserFactory(role=Role.SUPER_ADMIN, langue_preferee="fr")
        _eintraege("login_failed", 10)
        alarm.lauf()
        assert "anomalie" in Notification.objects.get(destinataire=fr).titre

    def test_sammelmeldung_kuerzt(self, admin):
        for i in range(8):
            _eintraege("totp_disabled", 1, user=UserFactory())
        alarm.lauf()
        n = Notification.objects.get(destinataire=admin)
        assert n.message.count("\n") == alarm.MAX_ZEILEN and "+ 3 weitere" in n.message


class TestApi:
    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_nur_app_admin(self):
        assert (
            self._client(UserFactory(role=Role.BUREAU_ADMIN))
            .get("/api/v1/aktivitaet/auffaelligkeiten/")
            .status_code
            == 403
        )

    def test_liste_und_erledigen(self, admin):
        _eintraege("login_failed", 10)
        alarm.lauf()
        c = self._client(admin)
        r = c.get("/api/v1/aktivitaet/auffaelligkeiten/").json()
        assert r["offen"] == 1 and r["ergebnisse"][0]["text"]["de"]
        aid = r["ergebnisse"][0]["id"]
        assert c.post(f"/api/v1/aktivitaet/auffaelligkeiten/{aid}/erledigen/").status_code == 200
        assert c.get("/api/v1/aktivitaet/auffaelligkeiten/").json()["ergebnisse"] == []
        erledigt = c.get("/api/v1/aktivitaet/auffaelligkeiten/?status=erledigt").json()
        assert erledigt["ergebnisse"][0]["erledigt_von"]["email"] == "admin@example.org"
        assert AuditLogEntry.objects.filter(action="auffaelligkeit_erledigt").count() == 1

    def test_uebersicht_kacheln(self, admin):
        _eintraege("login_failed", 10)
        _eintraege("server_fehler", 2, ip=None)
        alarm.lauf()
        k = uebersicht(30)["kacheln"]
        assert k["auffaelligkeiten_offen"] == 1 and k["server_fehler"] == 2


class TestBetrieb:
    def _lauf(self, pfad="/api/v1/membres/", status=500, user=None):
        request = RequestFactory().get(pfad)
        request.user = user or AnonymousUser()
        request.resolver_match = SimpleNamespace(url_name="x")
        AktivitaetMiddleware(lambda r: HttpResponse(status=status))(request)

    def test_5xx_wird_protokolliert_und_gedrosselt(self):
        pk = "5f0b3f6e-1c5a-4a52-9c2e-6b1d6c3a9f11"
        self._lauf(f"/api/v1/membres/{pk}/")
        self._lauf(f"/api/v1/membres/{pk}/")  # gleiche Schablone innerhalb einer Minute
        e = AuditLogEntry.objects.get(action="server_fehler")
        assert e.metadata["pfad"] == "/api/v1/membres/{id}" and e.metadata["status"] == 500

    def test_4xx_ist_kein_serverfehler(self):
        self._lauf(status=404)
        assert not AuditLogEntry.objects.filter(action="server_fehler").exists()

    def test_celery_fehler(self):
        class Task:
            name = "apps.x.tasks.y"

        task = Task()
        task_failure.send(sender=task, exception=ValueError("geheim"), task_id="1")
        e = AuditLogEntry.objects.get(action="task_fehlgeschlagen")
        assert e.metadata == {"task": "apps.x.tasks.y", "fehler": "ValueError"}

    def test_mailfehler_still_und_laut(self):
        texte = {"de": Texte(titre="T", paragraphes=["x"])}
        with mock.patch(
            "django.core.mail.message.EmailMultiAlternatives.send",
            side_effect=smtplib.SMTPException("kaputt"),
        ):
            assert (
                envoyer_email_cid(
                    sujet="s", destinataire="a@b.de", textes=texte, fail_silently=True
                )
                == 0
            )
            with pytest.raises(smtplib.SMTPException):
                envoyer_email_cid(sujet="s", destinataire="a@b.de", textes=texte)
        eintraege = AuditLogEntry.objects.filter(action="mail_fehler")
        assert eintraege.count() == 2
        assert eintraege.first().metadata == {"fehler": "SMTPException"}  # keine Adresse


def test_bereinigen_entfernt_alte_erledigte():
    alt = Auffaelligkeit.objects.create(
        regel="bruteforce",
        schluessel="a",
        status="erledigt",
        erkannt_am=timezone.now() - timedelta(days=800),
    )
    offen = Auffaelligkeit.objects.create(
        regel="bruteforce", schluessel="b", erkannt_am=timezone.now() - timedelta(days=800)
    )
    bereinigen()
    assert not Auffaelligkeit.objects.filter(pk=alt.pk).exists()
    assert Auffaelligkeit.objects.filter(pk=offen.pk).exists()

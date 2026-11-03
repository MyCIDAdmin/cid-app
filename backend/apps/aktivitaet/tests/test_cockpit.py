"""Tests — Cockpit der Seite „Aktivität“: Sicherheitswert, Vorperiode, Rollenkennung, Erinnerung."""

import pytest
from django.core import mail
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.aktivitaet import review
from apps.aktivitaet.services import rollen_text
from apps.rbac.models import RoleDefinition, UserRoleAssignment
from apps.rbac.tests.factories import UserFactory

from .test_aktivitaet import _eintrag

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN, email="admin@example.org")


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


def test_rollen_text_ist_sprachneutral():
    helfer = UserFactory(role=Role.BUREAU_ADMIN)
    eigene = RoleDefinition.objects.create(slug="kasse", nom="Kasse", is_system=False)
    UserRoleAssignment.objects.create(user=helfer, role=eigene)
    assert rollen_text(helfer) == "bureau_admin, Kasse"


def test_uebersicht_liefert_kennung_statt_uebersetztem_namen(admin):
    daten = _client(admin).get(reverse("aktivitaet:uebersicht")).json()
    assert daten["privilegiert"][0]["rolle"] == "super_admin"


def test_vorperiode_zaehlt_den_gleich_langen_zeitraum_davor(admin):
    _eintrag("login_failed", ip="1.1.1.1", vor_tagen=2)
    _eintrag("login_failed", ip="1.1.1.1", vor_tagen=9)
    _eintrag("login_failed", ip="1.1.1.1", vor_tagen=10)
    _eintrag("login_failed", ip="1.1.1.1", vor_tagen=40)  # davor : zählt nirgends
    daten = _client(admin).get(reverse("aktivitaet:uebersicht"), {"tage": 7}).json()
    assert daten["kacheln"]["fehlversuche"] == 1
    assert daten["vorperiode"]["fehlversuche"] == 2


def test_sicherheitswert_ohne_auffaelligkeiten_und_ohne_review(admin):
    lage = _client(admin).get(reverse("aktivitaet:uebersicht")).json()["lage"]
    # Authenticator fehlt beim einzigen Konto (0 von 40), die anderen Faktoren sind voll (30 + 30).
    assert lage["faktoren"]["totp"] == {"ist": 0, "soll": 1}
    assert lage["wert"] == 60 and lage["stufe"] == "kritisch"
    assert lage["review"] is None and lage["ohne_totp"] == 1
    assert lage["bericht"]["versendet"] is False


def test_sicherheitswert_mit_offener_review(admin):
    r, _ = review.anlegen("2026-Q4")
    lage = _client(admin).get(reverse("aktivitaet:uebersicht")).json()["lage"]
    assert lage["review"]["quartal"] == "2026-Q4"
    assert lage["review"]["anzahl"] == 1 and lage["review"]["entschieden"] == 0
    assert lage["wert"] == 30  # nur die Auffälligkeiten (keine) zählen voll
    assert r.positionen.count() == 1


class TestErinnerung:
    def test_nur_app_admin(self):
        bureau = UserFactory(role=Role.BUREAU_ADMIN)
        url = reverse("aktivitaet:totp-erinnerung")
        assert APIClient().post(url).status_code == 401
        assert _client(bureau).post(url).status_code == 403

    def test_sendet_an_konten_ohne_authenticator_und_nur_einmal_je_tag(self, admin):
        bureau = UserFactory(role=Role.BUREAU_ADMIN, email="bureau@example.org")
        UserFactory(role=Role.MEMBRE)  # kein erweitertes Recht : keine Mail
        url = reverse("aktivitaet:totp-erinnerung")
        antwort = _client(admin).post(url, {}, format="json").json()
        assert antwort["gesendet"] == 2 and not antwort["mail_aus"]
        assert {m.to[0] for m in mail.outbox} == {admin.email, bureau.email}
        assert AuditLogEntry.objects.filter(action="totp_erinnerung").count() == 2
        zweite = _client(admin).post(url, {}, format="json").json()
        assert zweite["gesendet"] == 0 and zweite["uebersprungen"] == 2
        assert len(mail.outbox) == 2

    def test_einzelnes_konto(self, admin):
        bureau = UserFactory(role=Role.BUREAU_ADMIN, email="bureau@example.org")
        antwort = (
            _client(admin)
            .post(reverse("aktivitaet:totp-erinnerung"), {"user": str(bureau.pk)}, format="json")
            .json()
        )
        assert antwort["gesendet"] == 1
        assert [m.to[0] for m in mail.outbox] == [bureau.email]

    def test_ungueltige_kennung(self, admin):
        r = _client(admin).post(
            reverse("aktivitaet:totp-erinnerung"), {"user": "kein-uuid"}, format="json"
        )
        assert r.status_code == 400

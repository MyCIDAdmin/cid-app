"""Tests — Aktivität (Release 20) : Zugriff, Übersicht, Journal, Export, Aufbewahrung."""

import csv
import io
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role, User
from apps.accounts.services import log_audit_event
from apps.aktivitaet.services import bereinigen
from apps.aktivitaet.tasks import aktivitaet_bereinigen
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(role=Role.SUPER_ADMIN)


def _client(user=None):
    c = APIClient()
    if user is not None:
        c.force_authenticate(user)
    return c


def _eintrag(aktion, user=None, ip="10.0.0.1", vor_tagen=0, **meta):
    e = AuditLogEntry.objects.create(
        action=aktion, user=user, ip_address=ip, user_agent="Chrome Android", metadata=meta
    )
    if vor_tagen:
        AuditLogEntry.objects.filter(pk=e.pk).update(
            created_at=timezone.now() - timedelta(days=vor_tagen)
        )
    return e


def test_nur_app_admin_hat_zugriff():
    bureau = UserFactory(role=Role.BUREAU_ADMIN)
    mitglied = UserFactory(role=Role.MEMBRE)
    for name in ("uebersicht", "journal", "export", "aktionen"):
        url = reverse(f"aktivitaet:{name}")
        assert _client().get(url).status_code == 401
        assert _client(mitglied).get(url).status_code == 403
        assert _client(bureau).get(url).status_code == 403


def test_login_fehlversuch_wird_protokolliert():
    User.objects.create_user(email="anna@example.de", password="Password123!", is_active=True)
    url = reverse("accounts:login")
    c = APIClient()
    assert (
        c.post(url, {"email": "anna@example.de", "password": "falsch"}, format="json").status_code
        == 401
    )
    assert (
        c.post(url, {"email": "fremd@example.de", "password": "x"}, format="json").status_code
        == 401
    )
    bekannt, unbekannt = AuditLogEntry.objects.filter(action="login_failed").order_by("created_at")
    assert bekannt.user.email == "anna@example.de"
    assert bekannt.metadata["email_masked"] == "a***@example.de"
    assert unbekannt.user is None
    assert unbekannt.metadata["email_masked"] == "f***@example.de"
    assert "fremd@example.de" not in str(unbekannt.metadata)


def test_uebersicht_zaehlt_und_fuellt_luecken(admin):
    anna = UserFactory(role=Role.MEMBRE)
    _eintrag("login_success", anna)
    _eintrag("login_2fa_success", anna)
    _eintrag("login_failed", None, ip="1.2.3.4")
    _eintrag("login_failed", None, ip="1.2.3.4")
    _eintrag("role_changed", admin)
    _eintrag("login_success", anna, vor_tagen=60)  # außerhalb von 30 Tagen
    antwort = _client(admin).get(reverse("aktivitaet:uebersicht"), {"tage": 30})
    assert antwort.status_code == 200
    k = antwort.data["kacheln"]
    assert (k["logins"], k["fehlversuche"], k["rollenaenderungen"], k["aktive_nutzer"]) == (
        2,
        2,
        1,
        1,
    )
    assert len(antwort.data["verlauf"]) == 30
    assert sum(t["logins"] for t in antwort.data["verlauf"]) == 2
    assert antwort.data["top_ips"][0] == {
        "ip": "1.2.3.4",
        "anzahl": 2,
        "zuletzt": antwort.data["top_ips"][0]["zuletzt"],
    }
    assert sum(sum(zeile) for zeile in antwort.data["heatmap"]) == 2
    # Ungültiger Zeitraum fällt auf 30 Tage zurück ; Konten-Sicht ist enthalten.
    assert _client(admin).get(reverse("aktivitaet:uebersicht"), {"tage": 5}).data["tage"] == 30
    assert any(p["email"] == admin.email for p in antwort.data["privilegiert"])


def test_journal_filter_und_seiten(admin):
    anna = UserFactory(role=Role.MEMBRE)
    for _ in range(55):
        _eintrag("login_success", anna)
    _eintrag("login_failed", None, ip="9.9.9.9")
    _eintrag("sujet_masque", admin)
    _eintrag("irgendwas_neues", admin)
    c = _client(admin)
    url = reverse("aktivitaet:journal")
    alle = c.get(url).data
    assert alle["anzahl"] >= 58 and len(alle["ergebnisse"]) == 50 and alle["seiten"] >= 2
    assert c.get(url, {"seite": 2}).data["seite"] == 2
    assert c.get(url, {"kategorie": "moderation"}).data["anzahl"] == 1
    assert (
        c.get(url, {"kategorie": "sonstige"}).data["ergebnisse"][0]["aktion"] == "irgendwas_neues"
    )
    assert c.get(url, {"gewicht": "warnung"}).data["anzahl"] == 1
    assert c.get(url, {"ip": "9.9.9.9"}).data["anzahl"] == 1
    assert c.get(url, {"ip": "kaputt"}).data["anzahl"] == 0
    assert c.get(url, {"user": str(anna.pk)}).data["anzahl"] == 55
    assert c.get(url, {"user": "kein-uuid"}).data["anzahl"] == 0
    assert c.get(url, {"q": anna.email}).data["anzahl"] == 55
    assert c.get(url, {"aktion": "sujet_masque,login_failed"}).data["anzahl"] == 2
    assert c.get(url, {"von": "2999-01-01"}).data["anzahl"] == 0
    assert c.get(url, {"von": "quatsch"}).status_code == 200
    eintrag = c.get(url, {"aktion": "login_failed"}).data["ergebnisse"][0]
    assert eintrag["label"]["de"] == "Anmeldung fehlgeschlagen" and eintrag["gewicht"] == "warnung"


def test_zugriff_wird_protokolliert_aber_nicht_doppelt(admin):
    c = _client(admin)
    c.get(reverse("aktivitaet:journal"))
    c.get(reverse("aktivitaet:uebersicht"))
    c.get(reverse("aktivitaet:journal"), {"seite": 2})
    assert AuditLogEntry.objects.filter(action="aktivitaet_geoeffnet", user=admin).count() == 1


def test_export_csv_mit_schutz_vor_formeln(admin):
    boese = UserFactory(role=Role.MEMBRE)
    _eintrag("login_success", boese, ip="5.5.5.5")
    AuditLogEntry.objects.filter(user=boese).update(user_agent="=HYPERLINK(1)")
    antwort = _client(admin).get(reverse("aktivitaet:export"), {"aktion": "login_success"})
    assert antwort.status_code == 200
    assert antwort["Content-Type"].startswith("text/csv")
    zeilen = list(csv.reader(io.StringIO(antwort.content.decode("utf-8-sig")), delimiter=";"))
    assert zeilen[0][:3] == ["Zeit", "Aktion", "Kategorie"]
    assert zeilen[1][1] == "Anmeldung erfolgreich" and zeilen[1][5] == "5.5.5.5"
    assert zeilen[1][6] == "'=HYPERLINK(1)"
    assert AuditLogEntry.objects.filter(action="aktivitaet_export", user=admin).count() == 1


def test_aktionen_liste_enthaelt_unbekannte(admin):
    _eintrag("brandneu", admin)
    daten = _client(admin).get(reverse("aktivitaet:aktionen")).data
    assert {k["key"] for k in daten["kategorien"]} >= {"anmeldung", "sonstige"}
    brandneu = next(a for a in daten["aktionen"] if a["aktion"] == "brandneu")
    assert brandneu["kategorie"] == "sonstige"


def test_bereinigung_nach_kategorie_und_ip_kuerzung(admin):
    _eintrag("login_success", admin, vor_tagen=200)  # Anmeldung : 180 Tage → weg
    _eintrag("role_changed", admin, vor_tagen=200)  # Rollen : 730 Tage → bleibt, IP weg
    _eintrag("role_changed", admin, vor_tagen=800)  # → weg
    _eintrag("unbekannt_alt", admin, vor_tagen=800)  # sonstige : 730 Tage → weg
    _eintrag("login_success", admin, vor_tagen=100)  # bleibt, IP weg
    _eintrag("login_success", admin, vor_tagen=1)  # bleibt samt IP
    ergebnis = bereinigen()
    assert ergebnis["geloescht"] == 3
    assert AuditLogEntry.objects.count() == 3
    assert AuditLogEntry.objects.filter(ip_address__isnull=True).count() == 2
    assert AuditLogEntry.objects.filter(ip_address__isnull=False).count() == 1
    assert ergebnis["ip_entfernt"] == 2


def test_bereinigungs_task_protokolliert_sich_nur_bei_aenderungen(admin):
    assert aktivitaet_bereinigen() == {"geloescht": 0, "ip_entfernt": 0}
    assert not AuditLogEntry.objects.filter(action="aktivitaet_bereinigt").exists()
    _eintrag("login_success", admin, vor_tagen=400)
    aktivitaet_bereinigen()
    assert AuditLogEntry.objects.filter(action="aktivitaet_bereinigt").count() == 1


def test_sperre_durch_axes_wird_protokolliert():
    from axes.signals import user_locked_out

    user_locked_out.send(sender=None, request=None, username="bob@example.de", ip_address="8.8.8.8")
    e = AuditLogEntry.objects.get(action="login_locked_out")
    assert e.ip_address == "8.8.8.8" and e.metadata["email_masked"] == "b***@example.de"


def test_alle_bekannten_aktionen_haben_zwei_sprachen():
    from apps.aktivitaet import kategorien as kat

    for aktion, (kategorie, gewicht, de, fr) in kat.AKTIONEN.items():
        assert kategorie in kat.KATEGORIEN and gewicht in ("info", "warnung", "wichtig")
        assert de and fr, aktion
    # Hilfsfunktion der Konten bleibt nutzbar
    log_audit_event("logout")
    assert kat.kategorie_von("logout") == "anmeldung"

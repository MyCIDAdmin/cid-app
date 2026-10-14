"""Release 21 — Datenänderungen und Exporte werden zentral protokolliert."""

import uuid
from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser
from django.http import HttpResponse
from django.test import RequestFactory
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.aktivitaet import kategorien as kat
from apps.aktivitaet.middleware import AktivitaetMiddleware, klassifizieren
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

UID = str(uuid.uuid4())


class TestKlassifizieren:
    @pytest.mark.parametrize(
        "methode,pfad,url_name,erwartet",
        [
            ("POST", "/api/v1/membres/", "membre-list", "membres_erstellt"),
            ("PATCH", f"/api/v1/membres/{UID}/", "membre-detail", "membres_geaendert"),
            ("DELETE", f"/api/v1/boutique/produits/{UID}/", "produit-detail", "boutique_geloescht"),
            (
                "POST",
                f"/api/v1/cotisations/zahlungseingaenge/{UID}/zuordnen/",
                "x",
                "cotisations_aktion",
            ),
            ("GET", "/api/v1/membres/export/", "membre-export", "membres_export"),
            ("GET", "/api/v1/stats/export/excel/", "export-excel", "stats_export"),
            ("POST", "/api/v1/membres/import/bestaetigen/", "x", "membres_import"),
            ("POST", "/api/v1/partenaires/import-ausgaben/", "x", "partenaires_import"),
            ("POST", "/api/v1/membres/rapprochement/fusionner/", "x", "membres_zusammengefuehrt"),
            (
                "POST",
                "/api/v1/finances/abschluss/wiedereroeffnen/",
                "x",
                "finances_wiedereroeffnet",
            ),
            ("POST", "/api/v1/finances/abschluss/", "abschluss", "finances_abschluss"),
            ("PUT", "/api/v1/notifications/parametres/", "p", "notifications_aktion"),
        ],
    )
    def test_aktionen(self, methode, pfad, url_name, erwartet):
        aktion, _schablone, _id = klassifizieren(methode, pfad, url_name)
        assert aktion == erwartet
        assert aktion in kat.AKTIONEN  # jede erzeugte Aktion ist bekannt und beschriftet

    @pytest.mark.parametrize(
        "methode,pfad",
        [
            ("GET", "/api/v1/membres/"),  # Lesen wird nicht protokolliert
            ("POST", "/api/v1/auth/login/"),  # eigene Einträge
            ("POST", "/api/v1/communaute/publications/"),  # eigene Einträge
            ("POST", "/api/v1/rbac/roles/"),  # eigene Einträge
            ("POST", f"/api/v1/notifications/notifications/{UID}/mark-read/"),
            ("POST", f"/api/v1/umfragen/{UID}/teilnehmen/"),  # Wahlgeheimnis
            ("POST", f"/api/v1/votes/{UID}/voter/"),
            ("POST", "/api/v1/kalender/ausblenden/"),
            ("POST", "/api/v1/membres/import/pruefen/"),  # Trockenlauf = kein Import
            ("OPTIONS", "/api/v1/membres/"),
            ("POST", "/health/"),
        ],
    )
    def test_ignoriert(self, methode, pfad):
        assert klassifizieren(methode, pfad, "x") is None

    def test_ids_werden_maskiert(self):
        _a, schablone, objekt = klassifizieren("POST", f"/api/v1/membres/{UID}/x/", "x")
        assert schablone == "{id}/x" and objekt == UID

    def test_alle_aktionen_haben_kategorie_und_beschriftung(self):
        for aktion, (k, g, de, fr) in kat.AKTIONEN.items():
            assert k in kat.KATEGORIEN and g in ("info", "warnung", "wichtig")
            assert de and fr


def _lauf(user, methode, pfad, status=201, url_name="membre-list"):
    """Schickt eine Anfrage durch die Middleware mit einer Attrappen-Antwort."""
    request = RequestFactory().generic(methode, pfad, HTTP_USER_AGENT="Firefox")
    request.user = user
    request.resolver_match = SimpleNamespace(url_name=url_name)
    AktivitaetMiddleware(lambda r: HttpResponse(status=status))(request)


class TestMiddleware:
    def test_erstellen_wird_protokolliert(self):
        user = UserFactory(role=Role.SUPER_ADMIN)
        _lauf(user, "POST", "/api/v1/membres/")
        e = AuditLogEntry.objects.get(action="membres_erstellt")
        assert e.user == user and e.metadata == {"methode": "POST", "pfad": "", "status": 201}
        assert e.user_agent == "Firefox"

    def test_loeschen_sensibler_daten_ist_warnung(self):
        user = UserFactory(role=Role.SUPER_ADMIN)
        _lauf(user, "DELETE", f"/api/v1/cotisations/{UID}/", 204, "cotisation-detail")
        e = AuditLogEntry.objects.get(action="cotisations_geloescht")
        assert e.metadata["objekt_id"] == UID
        assert kat.gewicht_von(e.action) == "warnung"

    def test_fehlschlag_nicht_protokolliert(self):
        _lauf(UserFactory(role=Role.SUPER_ADMIN), "POST", "/api/v1/membres/", 400)
        assert not AuditLogEntry.objects.exists()

    def test_anonym_nicht_protokolliert(self):
        _lauf(AnonymousUser(), "POST", "/api/v1/membres/")
        assert not AuditLogEntry.objects.exists()

    def test_fehler_im_protokoll_bricht_anfrage_nicht(self, monkeypatch):
        def kaputt(*a, **k):
            raise RuntimeError("db weg")

        monkeypatch.setattr("apps.accounts.services.log_audit_event", kaputt)
        _lauf(UserFactory(role=Role.SUPER_ADMIN), "POST", "/api/v1/membres/")  # kein Fehler

    def test_export_ende_zu_ende(self):
        admin = UserFactory(role=Role.SUPER_ADMIN)
        c = APIClient()
        c.force_authenticate(admin)
        assert c.get("/api/v1/membres/export/").status_code == 200
        e = AuditLogEntry.objects.get(action="membres_export")
        assert e.user == admin and kat.gewicht_von("membres_export") == "wichtig"
        # Lesen der Liste wird nicht protokolliert
        c.get("/api/v1/membres/")
        assert AuditLogEntry.objects.filter(action__startswith="membres_").count() == 1

    def test_journal_zeigt_neue_kategorien(self):
        admin = UserFactory(role=Role.SUPER_ADMIN)
        _lauf(admin, "POST", "/api/v1/boutique/produits/", 201, "produit-list")
        c = APIClient()
        c.force_authenticate(admin)
        r = c.get("/api/v1/aktivitaet/journal/", {"kategorie": "shop"})
        assert [e["aktion"] for e in r.json()["ergebnisse"]] == ["boutique_erstellt"]
        assert r.json()["ergebnisse"][0]["label"]["de"] == "Shop: angelegt"

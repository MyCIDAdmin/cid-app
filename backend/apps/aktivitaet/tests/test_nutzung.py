"""Release 23 — Nutzungsstatistik (nur Summen, ein Fenster je Person, Modul und 5 Minuten)."""

from datetime import timedelta
from types import SimpleNamespace

import pytest
from django.http import HttpResponse
from django.test import RequestFactory
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.aktivitaet import nutzung
from apps.aktivitaet.middleware import AktivitaetMiddleware
from apps.aktivitaet.models import Nutzung
from apps.aktivitaet.services import bereinigen
from apps.rbac.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _anfrage(user, pfad="/api/v1/membres/", methode="GET", status=200):
    request = RequestFactory().generic(methode, pfad)
    request.user = user
    request.resolver_match = SimpleNamespace(url_name="x")
    AktivitaetMiddleware(lambda r: HttpResponse(status=status))(request)


class TestZaehlen:
    def test_modul_von_pfad(self):
        assert nutzung.modul_von("/api/v1/membres/export/") == "membres"
        assert nutzung.modul_von("/api/v1/auth/login/") is None
        assert nutzung.modul_von("/api/v1/notifications/notifications/") is None
        assert nutzung.modul_von("/api/v1/aktivitaet/nutzung/") is None
        assert nutzung.modul_von("/health/") is None

    def test_ein_fenster_je_fuenf_minuten(self):
        u = UserFactory()
        for _ in range(5):
            _anfrage(u)
        n = Nutzung.objects.get(user=u, modul="membres")
        assert n.anzahl == 1 and n.tag == nutzung.heute()

    def test_neues_fenster_erhoeht_zaehler(self):
        from django.core.cache import cache

        u = UserFactory()
        _anfrage(u)
        cache.delete(f"nutzung:{u.pk}:membres")  # 5 Minuten später
        _anfrage(u)
        assert Nutzung.objects.get(user=u).anzahl == 2

    def test_module_getrennt_und_anonym_ignoriert(self):
        from django.contrib.auth.models import AnonymousUser

        u = UserFactory()
        _anfrage(u, "/api/v1/membres/")
        _anfrage(u, "/api/v1/boutique/produits/", "POST", 201)
        _anfrage(AnonymousUser(), "/api/v1/membres/")
        assert set(Nutzung.objects.values_list("modul", flat=True)) == {"membres", "boutique"}

    def test_fehlerantworten_zaehlen_nicht(self):
        _anfrage(UserFactory(), status=403)
        assert not Nutzung.objects.exists()

    def test_keine_pfade_oder_inhalte_gespeichert(self):
        assert {f.name for f in Nutzung._meta.get_fields()} == {
            "id",
            "user",
            "tag",
            "modul",
            "anzahl",
        }


class TestStatistik:
    def _eintrag(self, user, modul, vor_tagen=0, anzahl=1):
        return Nutzung.objects.create(
            user=user, modul=modul, tag=nutzung.heute() - timedelta(days=vor_tagen), anzahl=anzahl
        )

    def test_summen_und_ungenutzt(self):
        a, b = UserFactory(), UserFactory()
        self._eintrag(a, "membres", 0, 3)
        self._eintrag(b, "membres", 1, 2)
        self._eintrag(a, "boutique", 0)
        s = nutzung.statistik(7)
        membres = next(m for m in s["module"] if m["modul"] == "membres")
        assert membres["nutzer"] == 2 and membres["fenster"] == 5
        assert s["module"][0]["modul"] == "membres"  # nach Personen sortiert
        assert "membres" not in s["ungenutzt"] and "kalender" in s["ungenutzt"]
        assert len(s["verlauf"]) == 7
        assert s["verlauf"][-1] == {
            "tag": nutzung.heute().isoformat(),
            "nutzer": 1 + 0,
            "fenster": 4,
        }
        assert s["aktiv"]["d1"] == 1 and s["aktiv"]["d7"] == 2

    def test_zeitraum_begrenzt_module_nicht_aber_aktive_fenster(self):
        u = UserFactory()
        self._eintrag(u, "projets", 20)
        s = nutzung.statistik(7)
        assert "projets" in s["ungenutzt"] and s["aktiv"]["d30"] == 1 and s["aktiv"]["d7"] == 0

    def test_keine_personendaten_in_der_antwort(self):
        u = UserFactory(email="geheim@example.org")
        self._eintrag(u, "membres")
        assert "geheim" not in str(nutzung.statistik(30))


class TestApi:
    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_nur_app_admin(self):
        r = self._client(UserFactory(role=Role.BUREAU_ADMIN)).get("/api/v1/aktivitaet/nutzung/")
        assert r.status_code == 403

    def test_antwort_und_ungueltiger_zeitraum(self):
        c = self._client(UserFactory(role=Role.SUPER_ADMIN))
        assert c.get("/api/v1/aktivitaet/nutzung/?tage=7").json()["tage"] == 7
        assert c.get("/api/v1/aktivitaet/nutzung/?tage=5").json()["tage"] == 30
        assert c.get("/api/v1/aktivitaet/nutzung/?tage=x").json()["tage"] == 30

    def test_admin_ruft_statistik_auf_ohne_sich_selbst_zu_zaehlen(self):
        admin = UserFactory(role=Role.SUPER_ADMIN)
        self._client(admin).get("/api/v1/aktivitaet/nutzung/")
        assert not Nutzung.objects.filter(user=admin).exists()


def test_bereinigen_loescht_alte_nutzung():
    u = UserFactory()
    alt = Nutzung.objects.create(user=u, modul="membres", tag=nutzung.heute() - timedelta(days=401))
    neu = Nutzung.objects.create(
        user=u, modul="boutique", tag=nutzung.heute() - timedelta(days=399)
    )
    bereinigen()
    assert not Nutzung.objects.filter(pk=alt.pk).exists()
    assert Nutzung.objects.filter(pk=neu.pk).exists()


def test_konto_loeschen_entfernt_nutzung():
    u = UserFactory()
    Nutzung.objects.create(user=u, modul="membres", tag=nutzung.heute())
    u.delete()
    assert not Nutzung.objects.exists()

"""Fan-Konto (Release 29) : Anmeldung, Bestätigung, Rechte, Profil, Übergang zur Mitgliedschaft."""

from unittest import mock

import pytest

from apps.accounts.models import User
from apps.rbac import services as rbac
from apps.rbac.tests.factories import UserFactory
from apps.regionen.models import FanProfil, Region, Teilnahme
from apps.regionen.tests.test_regionen import BASIS, _client, _mitglied
from apps.regionen.tests.test_veranstaltungen import (  # noqa: F401
    _url,
    _veroeffentlichen,
    buero,
    karte,
    nord,
)

pytestmark = pytest.mark.django_db

PASSWORT = "Sehr-sicher-Passwort-2026!"  # pragma: allowlist secret


def _daten(**kw):
    d = {
        "email": "Fan@Example.org",
        "password": PASSWORT,
        "prenom": "Sami",
        "nom": "Ben Ali",
        "langue_preferee": "de",
        "land_de": "HH",
        "consentement_rgpd": True,
    }
    d.update(kw)
    return d


def _anmelden(**kw):
    with mock.patch("apps.regionen.fan.send_email_verification_code.delay") as mail:
        r = _client().post(f"{BASIS}fan/registrieren/", _daten(**kw), format="json")
    return r, mail


def _fan(**kw):
    """Bestätigtes Fan-Konto (ohne Mitgliedsfiche)."""
    user = UserFactory(is_active=True)
    FanProfil.objects.create(
        user=user,
        prenom=kw.pop("prenom", "Sami"),
        nom="Ben Ali",
        land_de=kw.pop("land_de", "HH"),
        datenschutz_am="2026-10-15T10:00:00Z",
        **kw,
    )
    user.refresh_from_db()
    return user


class TestOptionen:
    def test_oeffentlich_mit_regionen_und_standorten(self):
        r = _client().get(f"{BASIS}fan/optionen/")
        assert r.status_code == 200
        laender = {x["code"]: x for x in r.data["laender"]}
        assert len(laender) == 16 and laender["HH"]["region"]["slug"] == "nord"
        assert laender["HE"]["region"] is None
        assert isinstance(r.data["standorte"], list)


class TestRegistrieren:
    def test_legt_inaktives_konto_mit_profil_an_und_sendet_code(self):
        r, mail = _anmelden()
        assert r.status_code == 201
        user = User.objects.get(email="Fan@example.org")
        assert not user.is_active and not user.email_verifie and user.langue_preferee == "de"
        assert user.fan_profil.prenom == "Sami" and user.fan_profil.land_de == "HH"
        assert user.fan_profil.datenschutz_am is not None
        assert not hasattr(user, "membre")
        mail.assert_called_once()

    def test_einwilligung_pflicht(self):
        r, _ = _anmelden(consentement_rgpd=False)
        assert r.status_code == 400 and not User.objects.filter(email__iexact="fan@example.org")

    def test_doppelte_email_und_schwaches_passwort(self):
        UserFactory(email="fan@example.org")
        assert _anmelden()[0].status_code == 400
        assert _anmelden(email="neu@example.org", password="12345678")[0].status_code == 400

    def test_standort_muss_zum_bundesland_passen(self, nord_standort):
        assert _anmelden(land_de="BY", standort=str(nord_standort.pk))[0].status_code == 400
        r, _ = _anmelden(land_de="HH", standort=str(nord_standort.pk))
        assert r.status_code == 201

    def test_bestaetigung_aktiviert_ohne_meldung_ans_buero(self):
        r, mail = _anmelden()
        code = mail.call_args.args[1]
        with (
            mock.patch("apps.accounts.views.send_welcome_email.delay"),
            mock.patch("apps.accounts.views.notifier_nouvelle_inscription_rh.delay") as rh,
        ):
            ok = _client().post(
                "/api/v1/auth/register/confirm/",
                {"email": "Fan@example.org", "code": code},
                format="json",
            )
        assert ok.status_code == 200
        user = User.objects.get(email="Fan@example.org")
        assert user.is_active and user.email_verifie
        rh.assert_not_called()


class TestKonto:
    def test_me_zeigt_fan(self):
        fan = _fan()
        d = _client(fan).get("/api/v1/auth/me/").data
        assert d["ist_fan"] is True and d["prenom"] == "Sami" and d["statut_membre"] is None

    def test_mitglied_ist_kein_fan(self):
        assert _client(_mitglied()).get("/api/v1/auth/me/").data["ist_fan"] is False

    def test_region_aus_bundesland(self):
        d = _client(_fan(land_de="HH")).get(f"{BASIS}").data
        assert d["ohne_region"] is False
        assert _client(_fan(land_de="HE")).get(f"{BASIS}").data["ohne_region"] is True

    def test_fan_sieht_regionen_aber_keine_mitgliederbereiche(self):
        fan = _fan()
        assert _client(fan).get(f"{BASIS}nord/").status_code == 200
        # Die Barriere „Nicht-Mitglied“ gilt für Fans unverändert (force_authenticate umgeht sie).
        assert rbac.gate_nicht_mitglied(fan, "/api/v1/regionen/nord/") is True
        assert rbac.gate_nicht_mitglied(fan, "/api/v1/votes/") is False

    def test_fan_kann_reagieren_und_sich_anmelden(self, karte, buero):  # noqa: F811
        pk = _veroeffentlichen(karte, buero)
        fan = _fan()
        r = _client(fan).put(_url(pk, "anmeldung/"), {"aktiv": True}, format="json")
        assert r.status_code == 200 and r.data["angemeldet"] is True
        assert Teilnahme.objects.filter(user=fan).count() == 1


class TestProfil:
    def test_lesen_und_aendern(self, nord_standort):
        fan = _fan(land_de="BY")
        c = _client(fan)
        d = c.get(f"{BASIS}fan/").data
        assert d["region"]["slug"] == "muenchen" and d["email"] == fan.email
        r = c.patch(
            f"{BASIS}fan/",
            {"land_de": "HH", "standort": str(nord_standort.pk)},
            format="json",
        )
        assert r.status_code == 200 and r.data["region"]["slug"] == "nord"
        assert r.data["standort"] == "Hamburg"

    def test_bundeslandwechsel_entfernt_unpassenden_standort(self, nord_standort):
        fan = _fan(land_de="HH", standort=nord_standort)
        r = _client(fan).patch(f"{BASIS}fan/", {"land_de": "BY"}, format="json")
        assert r.status_code == 200 and r.data["standort_id"] is None

    def test_nur_fans_haben_ein_profil(self):
        assert _client(_mitglied()).get(f"{BASIS}fan/").status_code == 404
        assert _client().get(f"{BASIS}fan/").status_code in (401, 403)


class TestMitgliedWerden:
    DATEN = {
        "date_naissance": "1990-04-02",
        "telephone": "+491701234567",
        "adresse_de": "Hafenstr. 1",
        "ville_de": "Hamburg",
        "code_postal_de": "20095",
    }

    def test_legt_mitgliedsfiche_an(self):
        fan = _fan()
        r = _client(fan).post(f"{BASIS}fan/mitglied-werden/", self.DATEN, format="json")
        assert r.status_code == 201 and r.data["weiter"] == "/adhesions"
        fan.refresh_from_db()
        assert fan.membre.statut == "en_attente" and fan.membre.prenom == "Sami"
        assert fan.membre.land_de == "HH" and fan.fan_profil.mitgliedsantrag_am is not None
        me = _client(fan).get("/api/v1/auth/me/").data
        assert me["ist_fan"] is False and me["statut_membre"] == "en_attente"

    def test_nur_einmal_und_nur_fuer_fans(self):
        fan = _fan()
        c = _client(fan)
        assert c.post(f"{BASIS}fan/mitglied-werden/", self.DATEN, format="json").status_code == 201
        assert c.post(f"{BASIS}fan/mitglied-werden/", self.DATEN, format="json").status_code == 400
        url = f"{BASIS}fan/mitglied-werden/"
        assert _client(_mitglied()).post(url, self.DATEN, format="json").status_code == 404

    def test_pflichtfelder(self):
        r = _client(_fan()).post(f"{BASIS}fan/mitglied-werden/", {}, format="json")
        assert r.status_code == 400
        assert {"date_naissance", "telephone", "adresse_de", "ville_de"} <= set(r.data["details"])


@pytest.fixture
def nord_standort():
    from apps.regionen.models import Standort

    return Standort.objects.create(
        region=Region.objects.get(slug="nord"), name="Hamburg", land="HH"
    )

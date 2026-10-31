"""Tests — QR der Mitgliedskarte : Kennung, eigene Karte, Prüfung am Einlass."""

import datetime
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions import karte
from apps.adhesions.models import Mitgliedskarte, StatutSouscription
from apps.adhesions.tests.factories import (
    CampagneAdhesionFactory,
    OffreAdhesionFactory,
    SouscriptionFactory,
)
from apps.eintritt import tasks
from apps.evenements.tests.factories import EvenementFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _user(email="karte@example.de", role=Role.MEMBRE, **membre):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user, **membre)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _laufende_kampagne(**extra):
    heute = timezone.localdate()
    return CampagneAdhesionFactory(
        annee=heute.year + 40,  # eindeutig, das Datum steuert die Gültigkeit
        date_debut=heute - datetime.timedelta(days=30),
        date_fin=heute + datetime.timedelta(days=300),
        **extra,
    )


def _bezahlt(membre, kampagne=None, nom="CID PLUS"):
    kampagne = kampagne or _laufende_kampagne()
    offre = OffreAdhesionFactory(campagne=kampagne, nom=nom)
    return SouscriptionFactory(membre=membre, offre=offre, statut=StatutSouscription.PAYEE)


class TestKarte:
    def test_karte_entsteht_einmal_und_bleibt_gleich(self):
        _, membre = _user()
        erste = karte.karte_von(membre)
        zweite = karte.karte_von(membre)
        assert erste.pk == zweite.pk
        assert erste.code == zweite.code
        assert len(erste.code) >= 24
        assert Mitgliedskarte.objects.count() == 1

    def test_codes_sind_verschieden(self):
        a = karte.karte_von(MembreFactory())
        b = karte.karte_von(MembreFactory())
        assert a.code != b.code

    def test_qr_enthaelt_nur_praefix_und_code(self):
        _, membre = _user(prenom="Amel", nom="Bekir")
        k = karte.karte_von(membre)
        assert karte.qr_inhalt(k) == f"CID-M:{k.code}"
        assert "Amel" not in karte.qr_inhalt(k)
        assert membre.numero_membre not in karte.qr_inhalt(k)
        assert karte.qr_data_url(k).startswith("data:image/png;base64,")


class TestMeineKarteApi:
    url = "/api/v1/adhesions/karte/mein/"

    def test_liefert_code_und_qr(self):
        user, membre = _user()
        r = _client(user).get(self.url)
        assert r.status_code == 200
        assert r.data["code"] == karte.karte_von(membre).code
        assert r.data["qr"].startswith("data:image/png;base64,")

    def test_ohne_anmeldung_401(self):
        assert APIClient().get(self.url).status_code in (401, 403)

    def test_ohne_mitgliedsakte_404(self):
        user = User.objects.create_user(
            email="fan@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
        )
        assert _client(user).get(self.url).status_code == 404

    def test_zeigt_nur_die_eigene_karte(self):
        user_a, membre_a = _user("a@example.de")
        _, membre_b = _user("b@example.de")
        r = _client(user_a).get(self.url)
        assert r.data["code"] == karte.karte_von(membre_a).code
        assert r.data["code"] != karte.karte_von(membre_b).code


class TestPruefen:
    def test_gueltig_mit_bezahlter_laufender_mitgliedschaft(self):
        _, membre = _user(prenom="Amel", nom="Bekir")
        sub = _bezahlt(membre)
        k = karte.karte_von(membre)
        r = karte.pruefen(f"CID-M:{k.code}")
        assert r["ergebnis"] == "karte_gueltig"
        assert r["karte"] == {
            "name": "Amel Bekir",
            "angebot": "CID PLUS",
            "gueltig_bis": sub.campagne.date_fin.isoformat(),
        }

    def test_abgelaufen_ohne_laufende_mitgliedschaft(self):
        _, membre = _user()
        alt = CampagneAdhesionFactory(
            annee=2001,
            date_debut=datetime.date(2001, 1, 1),
            date_fin=datetime.date(2001, 12, 31),
        )
        _bezahlt(membre, alt)
        r = karte.pruefen(f"CID-M:{karte.karte_von(membre).code}")
        assert r["ergebnis"] == "karte_abgelaufen"
        assert r["karte"]["angebot"] == ""
        assert r["karte"]["gueltig_bis"] is None

    def test_unbezahlt_gilt_nicht(self):
        _, membre = _user()
        kampagne = _laufende_kampagne()
        offre = OffreAdhesionFactory(campagne=kampagne)
        SouscriptionFactory(
            membre=membre, offre=offre, statut=StatutSouscription.EN_ATTENTE_PAIEMENT
        )
        r = karte.pruefen(f"CID-M:{karte.karte_von(membre).code}")
        assert r["ergebnis"] == "karte_abgelaufen"

    def test_noch_nicht_gestartete_kampagne_gilt_nicht(self):
        _, membre = _user()
        heute = timezone.localdate()
        spaeter = CampagneAdhesionFactory(
            annee=heute.year + 41,
            date_debut=heute + datetime.timedelta(days=10),
            date_fin=heute + datetime.timedelta(days=400),
        )
        _bezahlt(membre, spaeter)
        r = karte.pruefen(f"CID-M:{karte.karte_von(membre).code}")
        assert r["ergebnis"] == "karte_abgelaufen"

    @pytest.mark.parametrize("text", ["CID-M:gibtsnicht", "CID-M:", "CID-M:  ", ""])
    def test_unbekannter_code(self, text):
        assert karte.pruefen(text) == {"ergebnis": "unbekannt"}

    def test_ist_kartencode(self):
        assert karte.ist_kartencode(" CID-M:abc ")
        assert not karte.ist_kartencode("CID-T:abc")
        assert not karte.ist_kartencode(None)


class TestEinlassScan:
    """Der Scan einer Mitgliedskarte läuft über den vorhandenen Prüf-Endpunkt des Einlasses."""

    @pytest.fixture(autouse=True)
    def _kein_versand(self):
        with mock.patch.object(tasks.ticket_senden, "delay"):
            yield

    def _pruefen(self, user, code):
        evenement = EvenementFactory(ticket_aktiv=True)
        return _client(user).post(
            f"/api/v1/eintritt/einlass/veranstaltung/{evenement.pk}/pruefen/",
            {"code": code},
            format="json",
        )

    def test_buero_sieht_name_angebot_und_gueltigkeit(self):
        buero, _ = _user("buero@example.de", Role.BUREAU_ADMIN)
        _, membre = _user("mitglied@example.de", prenom="Amel", nom="Bekir")
        _bezahlt(membre)
        r = self._pruefen(buero, f"CID-M:{karte.karte_von(membre).code}")
        assert r.status_code == 200
        assert r.data["ergebnis"] == "karte_gueltig"
        assert r.data["karte"]["name"] == "Amel Bekir"
        assert r.data["karte"]["angebot"] == "CID PLUS"

    def test_ohne_einlass_recht_verboten_und_keine_daten(self):
        normal, _ = _user("normal@example.de")
        _, membre = _user("mitglied@example.de", prenom="Amel", nom="Bekir")
        _bezahlt(membre)
        r = self._pruefen(normal, f"CID-M:{karte.karte_von(membre).code}")
        assert r.status_code == 403
        assert "Amel" not in str(r.data)

    def test_scan_bucht_nichts(self):
        from apps.eintritt.models import Einlass

        buero, _ = _user("buero@example.de", Role.BUREAU_ADMIN)
        _, membre = _user("mitglied@example.de")
        _bezahlt(membre)
        self._pruefen(buero, f"CID-M:{karte.karte_von(membre).code}")
        assert Einlass.objects.count() == 0

    def test_tickets_laufen_unveraendert(self):
        buero, _ = _user("buero@example.de", Role.BUREAU_ADMIN)
        r = self._pruefen(buero, "CID-T:gibtsnicht")
        assert r.data["ergebnis"] == "unbekannt"

"""Tests der automatischen Übersetzung (DeepL wird gemockt — kein Netzwerkzugriff)."""

from decimal import Decimal  # noqa: F401
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.evenements.tests.factories import EvenementFactory
from apps.uebersetzung import deepl
from apps.uebersetzung.models import Uebersetzung
from apps.uebersetzung.services import manuell_speichern, uebersetze_objekt, uebersetzungen_von

pytestmark = pytest.mark.django_db


def _fake(text, ziel, *, html=False):
    # Original ist Französisch ; Übersetzung = "[ziel] text", Quellsprache fr.
    return f"[{ziel}] {text}", "fr"


def test_ohne_schluessel_inaktiv():
    ev = EvenementFactory(description="Bonjour")
    assert not deepl.ist_aktiv()
    assert uebersetze_objekt(ev) == 0
    assert Uebersetzung.objects.count() == 0


@override_settings(DEEPL_API_KEY="test:fx")
def test_uebersetzt_in_andere_sprachen_und_merkt_originalsprache():
    ev = EvenementFactory(titre="Match", description="Bonjour")
    with patch("apps.uebersetzung.services.deepl.uebersetzen", side_effect=_fake) as mock:
        uebersetze_objekt(ev)
        erster_lauf = mock.call_count
        uebersetze_objekt(ev)  # nichts geändert -> keine neuen API-Aufrufe
        assert mock.call_count == erster_lauf
    ergebnis = uebersetzungen_von(ev)
    assert ergebnis["description"]["de"] == "[de] Bonjour"
    assert ergebnis["description"]["ar"] == "[ar] Bonjour"
    # Französisch ist die Originalsprache: Originaltext wird als aktuell vermerkt.
    assert ergebnis["description"]["fr"] == "Bonjour"


@override_settings(DEEPL_API_KEY="test:fx")
def test_geaenderter_text_macht_alte_uebersetzung_ungueltig_und_wird_neu_uebersetzt():
    ev = EvenementFactory(description="Bonjour")
    with patch("apps.uebersetzung.services.deepl.uebersetzen", side_effect=_fake):
        uebersetze_objekt(ev)
        ev.description = "Salut"
        ev.save()
        assert "description" not in uebersetzungen_von(ev) or (
            "de" not in uebersetzungen_von(ev)["description"]
        )
        uebersetze_objekt(ev)
    assert uebersetzungen_von(ev)["description"]["de"] == "[de] Salut"


@override_settings(DEEPL_API_KEY="test:fx")
def test_manuelle_korrektur_bleibt_bei_unveraendertem_original():
    ev = EvenementFactory(description="Bonjour")
    with patch("apps.uebersetzung.services.deepl.uebersetzen", side_effect=_fake):
        uebersetze_objekt(ev)
        manuell_speichern(ev, "description", "de", "Guten Tag")
        uebersetze_objekt(ev)
    assert uebersetzungen_von(ev)["description"]["de"] == "Guten Tag"
    assert Uebersetzung.objects.get(feld="description", sprache="de").automatisch is False


def test_serializer_enthaelt_uebersetzungen():
    from apps.evenements.serializers import EvenementSerializer

    ev = EvenementFactory(description="Bonjour")
    manuell_speichern(ev, "description", "de", "Guten Tag")
    daten = EvenementSerializer(ev).data
    assert daten["uebersetzungen"]["description"]["de"] == "Guten Tag"


def _admin(role=Role.BUREAU_ADMIN, email="uebers@example.de"):
    return User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)


def test_verwaltungs_api_lesen_und_manuell_aendern():
    ev = EvenementFactory(description="Bonjour")
    client = APIClient()
    client.force_authenticate(user=_admin())
    url = reverse("uebersetzung:objekt", args=["evenements.evenement", str(ev.pk)])
    antwort = client.get(url)
    assert antwort.status_code == 200
    assert {f["feld"] for f in antwort.json()["felder"]} == {"titre", "description"}
    antwort = client.put(
        url, {"feld": "description", "sprache": "ar", "text": "مرحبا"}, format="json"
    )
    assert antwort.status_code == 200
    beschr = next(f for f in antwort.json()["felder"] if f["feld"] == "description")
    assert beschr["sprachen"]["ar"] == {"text": "مرحبا", "automatisch": False}


def test_verwaltungs_api_verboten_fuer_mitglied_und_unbekanntes_modell():
    ev = EvenementFactory()
    client = APIClient()
    client.force_authenticate(user=_admin(Role.MEMBRE, "m-uebers@example.de"))
    url = reverse("uebersetzung:objekt", args=["evenements.evenement", str(ev.pk)])
    assert client.get(url).status_code == 403
    client.force_authenticate(user=_admin(email="a2-uebers@example.de"))
    assert client.get(reverse("uebersetzung:objekt", args=["auth.user", "1"])).status_code == 404


def test_neu_uebersetzen_ohne_schluessel_400():
    ev = EvenementFactory()
    client = APIClient()
    client.force_authenticate(user=_admin())
    url = reverse("uebersetzung:neu", args=["evenements.evenement", str(ev.pk)])
    assert client.post(url).status_code == 400

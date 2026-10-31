"""Tests — Vorteile eines Angebots mit Symbol und Ziel (apps.adhesions.vorteile)."""

import pytest
from django.urls import reverse
from rest_framework import serializers
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions.tests.factories import OffreAdhesionFactory
from apps.adhesions.vorteile import ICONS, MAX_VORTEILE, ZIELE, pruefe_vorteile
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _url(offre):
    return reverse("adhesions:offre-detail", args=[offre.id])


def _admin_client(email="admin-vorteile@example.de"):
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )
    MembreFactory(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_listen_sind_eindeutig_und_nicht_leer():
    assert len(ICONS) == len(set(ICONS)) > 0
    assert len(ZIELE) == len(set(ZIELE)) > 0
    assert "check" in ICONS  # Standard-Symbol für alte Vorteile


def test_pruefe_vorteile_bereinigt_und_vergibt_reihenfolge():
    ergebnis = pruefe_vorteile(
        [
            {"texte_fr": "  Mitgliederpreis im Shop  ", "icone": "bag", "ziel": "shop"},
            {"texte_fr": "Stimmrecht", "ordre": 7},
        ]
    )
    assert ergebnis[0] == {
        "texte_fr": "Mitgliederpreis im Shop",
        "icone": "bag",
        "ziel": "shop",
        "ordre": 1,
    }
    assert ergebnis[1]["ordre"] == 7
    assert ergebnis[1]["icone"] == ""
    assert ergebnis[1]["ziel"] == ""


def test_pruefe_vorteile_laesst_uebersetzungsfelder_unberuehrt():
    ergebnis = pruefe_vorteile([{"ordre": 1, "texte_fr": "A", "texte_de": "B", "texte_ar": "C"}])
    assert ergebnis[0]["texte_de"] == "B"
    assert ergebnis[0]["texte_ar"] == "C"


@pytest.mark.parametrize(
    "wert",
    [
        "kein Liste",
        ["kein Objekt"],
        [{"texte_fr": ""}],
        [{"texte_fr": "   "}],
        [{"ordre": 1}],
        [{"texte_fr": "x" * 201}],
        [{"texte_fr": "A", "icone": "neon"}],
        [{"texte_fr": "A", "ziel": "https://example.org"}],
        [{"texte_fr": "A", "ordre": "eins"}],
        [{"texte_fr": "A", "ordre": True}],
        [{"texte_fr": "A"}] * (MAX_VORTEILE + 1),
    ],
)
def test_pruefe_vorteile_lehnt_ungueltiges_ab(wert):
    with pytest.raises(serializers.ValidationError):
        pruefe_vorteile(wert)


def test_verwaltung_speichert_vorteile_mit_symbol_und_ziel():
    offre = OffreAdhesionFactory()
    client = _admin_client()

    antwort = client.patch(
        _url(offre),
        {
            "avantages": [
                {"ordre": 1, "texte_fr": "Mitgliederpreis im Shop", "icone": "bag", "ziel": "shop"},
                {
                    "ordre": 2,
                    "texte_fr": "Vorrang bei Tickets",
                    "icone": "ticket",
                    "ziel": "tickets",
                },
                {"ordre": 3, "texte_fr": "Stimmrecht"},
            ]
        },
        format="json",
    )

    assert antwort.status_code == 200, antwort.data
    offre.refresh_from_db()
    assert [(v["icone"], v["ziel"]) for v in offre.avantages] == [
        ("bag", "shop"),
        ("ticket", "tickets"),
        ("", ""),
    ]
    assert antwort.data["avantages"][0]["ziel"] == "shop"


def test_verwaltung_lehnt_unbekanntes_symbol_oder_ziel_ab():
    offre = OffreAdhesionFactory()
    vorher = list(offre.avantages)
    client = _admin_client("admin-vorteile-2@example.de")

    for eintrag in (
        {"ordre": 1, "texte_fr": "A", "icone": "neon"},
        {"ordre": 1, "texte_fr": "A", "ziel": "/admin/roles"},
    ):
        antwort = client.patch(_url(offre), {"avantages": [eintrag]}, format="json")
        assert antwort.status_code == 400, antwort.data

    offre.refresh_from_db()
    assert offre.avantages == vorher


def test_alte_vorteile_ohne_symbol_bleiben_lesbar():
    offre = OffreAdhesionFactory()  # Factory-Vorteil ohne icone/ziel
    antwort = _admin_client("admin-vorteile-3@example.de").get(_url(offre))
    assert antwort.status_code == 200
    assert antwort.data["avantages"][0]["texte_fr"] == "Accès club"

"""
Tests — Aktivitätsprotokoll (2026-10-07) : jede relevante Aktion im Arbeitsbereich erzeugt einen
Eintrag ; lesbar nur für Team, Verwaltung und Finanzen ; nie von außen schreibbar.
"""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.finances.models import CategorieDepense
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import (
    AktionAktivitaet,
    Aufgabe,
    ProjetAktivitaet,
    ProjetMitglied,
    RolleProjet,
)
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    return user, MembreFactory(user=user)


def _client(user=None):
    client = APIClient()
    if user is not None:
        client.force_authenticate(user=user)
    return client


@pytest.fixture
def team():
    leitung_u, leitung_m = _user(Role.MEMBRE, "aleitung@example.de")
    mit_u, mit_m = _user(Role.MEMBRE, "amit@example.de")
    fremd_u, _ = _user(Role.MEMBRE, "afremd@example.de")
    projet = ProjetFactory(responsable=leitung_m)
    ProjetMitglied.objects.create(projet=projet, membre=mit_m, rolle=RolleProjet.MITARBEIT)
    return {"projet": projet, "leitung": leitung_u, "mit": mit_u, "mit_m": mit_m, "fremd": fremd_u}


def _aktionen(projet):
    return list(
        ProjetAktivitaet.objects.filter(projet=projet)
        .order_by("zeitpunkt", "id")
        .values_list("aktion", flat=True)
    )


def test_aufgabe_lebenszyklus_wird_protokolliert(team):
    client = _client(team["leitung"])
    resp = client.post(
        reverse("projets:projet-aufgabe-list"),
        {
            "projet": str(team["projet"].id),
            "titel": "Flyer",
            "verantwortlich": str(team["mit_m"].id),
        },
        format="json",
    )
    aufgabe_id = resp.data["id"]
    client.post(
        reverse("projets:projet-aufgabe-verschieben", args=[aufgabe_id]),
        {"status": "in_arbeit", "position": 0},
        format="json",
    )
    client.post(
        reverse("projets:projet-aufgabe-kommentar-list"),
        {"aufgabe": aufgabe_id, "text": "Los"},
        format="json",
    )
    client.delete(reverse("projets:projet-aufgabe-detail", args=[aufgabe_id]))
    assert _aktionen(team["projet"]) == [
        AktionAktivitaet.AUFGABE_ERSTELLT,
        AktionAktivitaet.AUFGABE_VERSCHOBEN,
        AktionAktivitaet.AUFGABE_KOMMENTIERT,
        AktionAktivitaet.AUFGABE_GELOESCHT,
    ]
    verschoben = ProjetAktivitaet.objects.get(aktion=AktionAktivitaet.AUFGABE_VERSCHOBEN)
    assert verschoben.detail == "offen>in_arbeit" and verschoben.objekt == "Flyer"
    assert verschoben.akteur_name and verschoben.akteur is not None


def test_verschieben_in_dieselbe_spalte_erzeugt_keinen_eintrag(team):
    aufgabe = Aufgabe.objects.create(projet=team["projet"], titel="A")
    _client(team["leitung"]).post(
        reverse("projets:projet-aufgabe-verschieben", args=[aufgabe.id]),
        {"status": "offen", "position": 0},
        format="json",
    )
    assert _aktionen(team["projet"]) == []


def test_team_und_sichtbarkeit_werden_protokolliert(team):
    client = _client(team["leitung"])
    neu = MembreFactory()
    eintrag_id = client.post(
        reverse("projets:projet-team-list"),
        {"projet": str(team["projet"].id), "membre": str(neu.id), "rolle": "beobachter"},
        format="json",
    ).data["id"]
    client.patch(
        reverse("projets:projet-team-detail", args=[eintrag_id]),
        {"rolle": "mitarbeit"},
        format="json",
    )
    client.delete(reverse("projets:projet-team-detail", args=[eintrag_id]))
    client.post(
        reverse("projets:projet-sichtbarkeit", args=[team["projet"].id]),
        {"sichtbarkeit": "entwurf"},
        format="json",
    )
    assert _aktionen(team["projet"]) == [
        AktionAktivitaet.TEAM_HINZUGEFUEGT,
        AktionAktivitaet.TEAM_ROLLE,
        AktionAktivitaet.TEAM_ENTFERNT,
        AktionAktivitaet.SICHTBARKEIT,
    ]
    assert ProjetAktivitaet.objects.get(aktion=AktionAktivitaet.TEAM_ROLLE).detail == "mitarbeit"


def test_plan_und_kosten_werden_protokolliert(team):
    kat = CategorieDepense.objects.filter(actif=True).first()
    leitung = _client(team["leitung"])
    plan = leitung.post(
        reverse("projets:projet-plankosten-list"),
        {"projet": str(team["projet"].id), "categorie": str(kat.id), "betrag": "80"},
        format="json",
    ).data
    leitung.delete(reverse("projets:projet-plankosten-detail", args=[plan["id"]]))
    kosten = (
        _client(team["mit"])
        .post(
            reverse("projets:projet-kosten-list"),
            {
                "projet": str(team["projet"].id),
                "date_depense": datetime.date(2026, 5, 4).isoformat(),
                "montant": "12.00",
                "categorie": str(kat.id),
                "fournisseur": "Baumarkt",
            },
        )
        .data
    )
    _client(team["mit"]).delete(reverse("projets:projet-kosten-detail", args=[kosten["id"]]))
    assert _aktionen(team["projet"]) == [
        AktionAktivitaet.PLAN_GESETZT,
        AktionAktivitaet.PLAN_ENTFERNT,
        AktionAktivitaet.KOSTEN_ERFASST,
        AktionAktivitaet.KOSTEN_GELOESCHT,
    ]
    erfasst = ProjetAktivitaet.objects.get(aktion=AktionAktivitaet.KOSTEN_ERFASST)
    assert erfasst.objekt == "Baumarkt" and Decimal(erfasst.detail) == Decimal("12.00")


def test_protokoll_nur_fuer_berechtigte_lesbar_und_nie_schreibbar(team):
    ProjetAktivitaet.objects.create(
        projet=team["projet"], aktion=AktionAktivitaet.AUFGABE_ERSTELLT, objekt="X"
    )
    url = reverse("projets:projet-aktivitaet-list")
    assert _client().get(url).status_code == 401
    assert _client(team["fremd"]).get(url).data["results"] == []
    resp = _client(team["mit"]).get(url, {"projet": team["projet"].id})
    assert len(resp.data["results"]) == 1
    assert (
        _client(team["leitung"])
        .post(url, {"projet": str(team["projet"].id), "aktion": "aufgabe_erstellt"})
        .status_code
        == 405
    )


def test_fehlgeschlagene_aktion_hinterlaesst_keinen_eintrag(team):
    resp = _client(team["fremd"]).post(
        reverse("projets:projet-aufgabe-list"),
        {"projet": str(team["projet"].id), "titel": "Nope"},
        format="json",
    )
    assert resp.status_code == 403
    assert _aktionen(team["projet"]) == []

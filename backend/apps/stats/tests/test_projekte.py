"""Tests — Projekt-Kennzahlen im Statistik-Bereich (2026-10-07)."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.finances.models import CategorieDepense, Depense, StatutDepense
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import Aufgabe, PlanKosten, SichtbarkeitProjet, StatutAufgabe
from apps.projets.tests.factories import ProjetFactory
from apps.stats.services import kpis_projets

pytestmark = pytest.mark.django_db

URL = "stats:projets"


def _user(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    MembreFactory(user=user)
    return user


def _depense(projet, kat, montant, statut):
    return Depense.objects.create(
        date_depense=datetime.date(2026, 4, 2),
        montant=Decimal(montant),
        categorie=kat,
        fournisseur="X",
        statut=statut,
        projet=projet,
    )


def test_zugriff_wie_andere_stats_tabs():
    client = APIClient()
    assert client.get(reverse(URL)).status_code == 401
    client.force_authenticate(user=_user(Role.MEMBRE, "m@example.de"))
    assert client.get(reverse(URL)).status_code == 403
    client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "b@example.de"))
    assert client.get(reverse(URL)).status_code == 200


def test_kennzahlen_je_projekt_und_gesamt():
    kat = CategorieDepense.objects.filter(actif=True).first()
    projet = ProjetFactory(titre="Alpha", sichtbarkeit=SichtbarkeitProjet.VEROEFFENTLICHT)
    entwurf = ProjetFactory(titre="Beta", sichtbarkeit=SichtbarkeitProjet.ENTWURF)
    gestern = timezone.localdate() - datetime.timedelta(days=1)
    Aufgabe.objects.create(projet=projet, titel="a", status=StatutAufgabe.ERLEDIGT)
    Aufgabe.objects.create(projet=projet, titel="b", frist=gestern)
    Aufgabe.objects.create(projet=projet, titel="c", status=StatutAufgabe.IN_ARBEIT)
    PlanKosten.objects.create(projet=projet, categorie=kat, betrag=Decimal("200.00"))
    _depense(projet, kat, "50.00", StatutDepense.APPROUVEE)
    _depense(projet, kat, "20.00", StatutDepense.EN_ATTENTE)
    _depense(projet, kat, "999.00", StatutDepense.REJETEE)
    CotisationFactory(type_article=TypeArticle.PROJET, projet=projet, montant=Decimal("80.00"))

    daten = kpis_projets()
    assert daten["projekte_gesamt"] == 2
    assert daten["veroeffentlicht"] == 1 and daten["entwurf"] == 1
    assert daten["aufgaben"]["gesamt"] == 3 and daten["aufgaben"]["erledigt"] == 1
    assert daten["aufgaben"]["ueberfaellig"] == 1 and daten["aufgaben"]["quote"] == 33
    zeile = next(z for z in daten["projekte"] if z["id"] == str(projet.id))
    assert zeile["prozent"] == 33 and zeile["ueberfaellig"] == 1 and zeile["team"] == 1
    assert zeile["plan"] == Decimal("200.00") and zeile["ist"] == Decimal("50.00")
    assert zeile["offen"] == Decimal("20.00") and zeile["einnahmen"] == Decimal("80.00")
    assert zeile["ergebnis"] == Decimal("30.00")
    assert daten["kosten"]["auslastung"] == 25
    leer = next(z for z in daten["projekte"] if z["id"] == str(entwurf.id))
    assert leer["aufgaben_gesamt"] == 0 and leer["plan"] == Decimal("0.00")


def test_ohne_projekte_keine_division_durch_null():
    daten = kpis_projets()
    assert daten["projekte_gesamt"] == 0 and daten["kosten"]["auslastung"] is None
    assert daten["aufgaben"]["quote"] == 0

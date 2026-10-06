"""Tests — Änderungsprotokoll, Jahresabschluss, Prüfungsansicht, Steuerberater-CSV."""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.finances.models import (
    CategorieDepense,
    Depense,
    FinanzProtokoll,
    Jahresabschluss,
    StatutDepense,
)
from apps.stats.bilan import bilan_annuel, ecritures_comptables

pytestmark = pytest.mark.django_db

JAHR = timezone.localdate().year


@pytest.fixture
def api_client():
    return APIClient()


def _user(role, email):
    return User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)


@pytest.fixture
def fin1():
    return _user(Role.DIR_FINANCIER, "f1@example.de")


@pytest.fixture
def fin2():
    return _user(Role.DIR_FINANCIER, "f2@example.de")


@pytest.fixture
def admin():
    return _user(Role.SUPER_ADMIN, "root@example.de")


@pytest.fixture
def cat():
    return CategorieDepense.objects.first()


def _depense(cat, user, montant="50.00", statut=StatutDepense.EN_ATTENTE, jahr=JAHR):
    return Depense.objects.create(
        date_depense=datetime.date(jahr, 3, 10),
        montant=Decimal(montant),
        categorie=cat,
        fournisseur="Lieferant",
        statut=statut,
        saisie_par=user,
    )


def _post_depense(api_client, cat, jahr=JAHR):
    return api_client.post(
        reverse("finances:depense-list"),
        {
            "date_depense": f"{jahr}-03-10",
            "montant": "10",
            "categorie": str(cat.id),
            "fournisseur": "x",
        },
        format="json",
    )


# --- Protokoll -------------------------------------------------------------------------


def test_protokoll_erfasst_erstellen_aendern_freigeben_loeschen(api_client, fin1, fin2, cat):
    api_client.force_authenticate(user=fin1)
    r = _post_depense(api_client, cat)
    assert r.status_code == 201
    pk = r.data["id"]
    api_client.patch(
        reverse("finances:depense-detail", args=[pk]), {"montant": "99.00"}, format="json"
    )
    api_client.force_authenticate(user=fin2)
    api_client.post(reverse("finances:depense-approuver", args=[pk]))
    aktionen = list(FinanzProtokoll.objects.order_by("zeitpunkt").values_list("aktion", flat=True))
    assert aktionen == ["erstellt", "geaendert", "freigegeben"]
    geaendert = FinanzProtokoll.objects.get(aktion="geaendert")
    assert geaendert.aenderungen["montant"] == ["10.00", "99.00"]
    assert geaendert.benutzer_name == "f1@example.de"

    d2 = _post_depense(api_client, cat).data["id"]
    assert api_client.delete(reverse("finances:depense-detail", args=[d2])).status_code == 204
    assert FinanzProtokoll.objects.filter(aktion="geloescht").count() == 1


def test_protokoll_endpoint_nur_lesen_und_filterbar(api_client, fin1, cat):
    api_client.force_authenticate(user=fin1)
    _post_depense(api_client, cat)
    r = api_client.get(reverse("finances:protokoll"), {"aktion": "erstellt"})
    assert r.status_code == 200 and len(r.data) == 1
    assert api_client.post(reverse("finances:protokoll"), {}).status_code == 405


def test_budget_aenderung_wird_protokolliert(api_client, fin1, cat):
    api_client.force_authenticate(user=fin1)
    api_client.post(
        reverse("finances:budget"),
        {"annee": JAHR, "lignes": [{"categorie": str(cat.id), "montant": "300"}]},
        format="json",
    )
    assert FinanzProtokoll.objects.get(aktion="budget").aenderungen["montant"] == ["0", "300.00"]


# --- Jahresabschluss -------------------------------------------------------------------


def test_abschluss_blockiert_bei_offenen_ausgaben(api_client, fin1, cat):
    _depense(cat, fin1)
    api_client.force_authenticate(user=fin1)
    r = api_client.post(reverse("finances:abschluss"), {"annee": JAHR}, format="json")
    assert r.status_code == 409 and "Freigabe" in r.data["detail"]


def test_abschluss_sperrt_ausgaben_und_budget(api_client, fin1, fin2, cat):
    _depense(cat, fin1, "40.00", StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=fin2)
    r = api_client.post(reverse("finances:abschluss"), {"annee": JAHR}, format="json")
    assert r.status_code == 201 and r.data["abgeschlossen"] is True
    assert r.data["snapshot"]["depenses"] == "40.00"
    assert _post_depense(api_client, cat).status_code == 409
    budget = api_client.post(
        reverse("finances:budget"),
        {"annee": JAHR, "lignes": [{"categorie": str(cat.id), "montant": "1"}]},
        format="json",
    )
    assert budget.status_code == 409
    # anderes Jahr bleibt frei
    assert _post_depense(api_client, cat, jahr=JAHR - 1).status_code == 201
    # doppelt abschließen -> 409
    assert (
        api_client.post(reverse("finances:abschluss"), {"annee": JAHR}, format="json").status_code
        == 409
    )


def test_wiedereroeffnen_nur_app_admin_mit_grund(api_client, fin1, admin, cat):
    api_client.force_authenticate(user=fin1)
    api_client.post(reverse("finances:abschluss"), {"annee": JAHR}, format="json")
    url = reverse("finances:wiedereroeffnen")
    assert api_client.post(url, {"annee": JAHR, "grund": "x"}, format="json").status_code == 403
    api_client.force_authenticate(user=admin)
    assert api_client.post(url, {"annee": JAHR}, format="json").status_code == 400
    assert (
        api_client.post(url, {"annee": JAHR, "grund": "Korrektur"}, format="json").status_code
        == 200
    )
    assert not Jahresabschluss.objects.get(annee=JAHR).aktiv
    assert _post_depense(api_client, cat).status_code == 201
    assert FinanzProtokoll.objects.filter(aktion="wiedergeoeffnet").count() == 1


def test_bilan_zeigt_abweichung_nach_abschluss(fin1, cat):
    _depense(cat, fin1, "40.00", StatutDepense.APPROUVEE)
    APIClient()
    c = APIClient()
    c.force_authenticate(user=fin1)
    c.post(reverse("finances:abschluss"), {"annee": JAHR}, format="json")
    assert bilan_annuel(JAHR)["abschluss"]["abweichung"] == Decimal("0.00")
    CotisationFactory(
        type_article=TypeArticle.DON,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("25.00"),
        date_paiement=timezone.make_aware(datetime.datetime(JAHR, 2, 1)),
    )
    assert bilan_annuel(JAHR)["abschluss"]["abweichung"] == Decimal("25.00")


# --- Prüfung + CSV ---------------------------------------------------------------------


def test_pruefung_listet_ausgaben_ohne_beleg_und_grosse_betraege(api_client, fin1, cat):
    _depense(cat, fin1, "800.00", StatutDepense.APPROUVEE)
    _depense(cat, fin1, "20.00", StatutDepense.EN_ATTENTE)
    api_client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "ba@example.de"))  # nur Lesen
    r = api_client.get(reverse("finances:pruefung"), {"annee": JAHR})
    assert r.status_code == 200
    assert len(r.data["ohne_beleg"]) == 1 and len(r.data["grosse_ausgaben"]) == 1
    assert r.data["anzahl_offen"] == 1


def test_csv_summe_entspricht_dem_bilan(api_client, fin1, cat):
    CotisationFactory(
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("60.00"),
        date_paiement=timezone.make_aware(datetime.datetime(JAHR, 2, 5)),
    )
    _depense(cat, fin1, "20.50", StatutDepense.APPROUVEE)
    assert sum(z["betrag"] for z in ecritures_comptables(JAHR)) == bilan_annuel(JAHR)["resultat"]
    api_client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "ba2@example.de"))
    r = api_client.get(reverse("stats:export-buchungen-csv"), {"annee": JAHR})
    assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
    text = r.content.decode("utf-8-sig")
    assert text.splitlines()[0].startswith("Datum;Typ;Kategorie")
    assert "-20,50" in text and "60,00" in text

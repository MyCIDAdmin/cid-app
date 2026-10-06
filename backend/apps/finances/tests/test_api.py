"""Tests API — app finances (dépenses, quatre yeux, budget) + Jahresbilanz (apps.stats.bilan)."""

import datetime
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.finances.models import (
    BudgetAnnuel,
    CategorieDepense,
    Depense,
    Gesamtbudget,
    StatutDepense,
)
from apps.membres.tests.factories import MembreFactory
from apps.projets.tests.factories import ProjetFactory
from apps.stats.bilan import bilan_annuel

pytestmark = pytest.mark.django_db

ANNEE = 2026


@pytest.fixture
def api_client():
    return APIClient()


def _user(role, email):
    return User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)


@pytest.fixture
def dir_fin():
    return _user(Role.DIR_FINANCIER, "fin1@example.de")


@pytest.fixture
def dir_fin2():
    return _user(Role.DIR_FINANCIER, "fin2@example.de")


@pytest.fixture
def categorie():
    return CategorieDepense.objects.first()  # seedée par la migration


def _depense(categorie, saisie_par, montant="50.00", statut=StatutDepense.EN_ATTENTE, **kw):
    return Depense.objects.create(
        date_depense=kw.pop("date_depense", datetime.date(ANNEE, 3, 10)),
        montant=Decimal(montant),
        categorie=categorie,
        fournisseur="Fournisseur",
        statut=statut,
        saisie_par=saisie_par,
        **kw,
    )


def test_categories_par_defaut_seedees():
    assert CategorieDepense.objects.count() >= 5


def test_creation_depense_en_attente(api_client, dir_fin, categorie):
    api_client.force_authenticate(user=dir_fin)
    r = api_client.post(
        reverse("finances:depense-list"),
        {
            "date_depense": "2026-03-10",
            "montant": "120.50",
            "categorie": str(categorie.id),
            "fournisseur": "Salle Berlin",
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    assert r.data["statut"] == StatutDepense.EN_ATTENTE
    assert Depense.objects.get().saisie_par == dir_fin


@pytest.mark.parametrize("role", [Role.MEMBRE, Role.RH])
def test_acces_refuse_sans_page_finances(api_client, role):
    api_client.force_authenticate(user=_user(role, "x@example.de"))
    assert api_client.get(reverse("finances:depense-list")).status_code == 403


def test_bureau_admin_lecture_seule(api_client, categorie):
    api_client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "ba@example.de"))
    assert api_client.get(reverse("finances:depense-list")).status_code == 200
    r = api_client.post(
        reverse("finances:depense-list"),
        {
            "date_depense": "2026-01-01",
            "montant": "1",
            "categorie": str(categorie.id),
            "fournisseur": "x",
        },
        format="json",
    )
    assert r.status_code == 403


def test_quatre_yeux_pas_d_auto_approbation(api_client, dir_fin, categorie):
    d = _depense(categorie, dir_fin)
    api_client.force_authenticate(user=dir_fin)
    r = api_client.post(reverse("finances:depense-approuver", args=[d.id]))
    assert r.status_code == 403
    d.refresh_from_db()
    assert d.statut == StatutDepense.EN_ATTENTE


def test_approbation_par_une_autre_personne(api_client, dir_fin, dir_fin2, categorie):
    d = _depense(categorie, dir_fin)
    api_client.force_authenticate(user=dir_fin2)
    r = api_client.post(reverse("finances:depense-approuver", args=[d.id]))
    assert r.status_code == 200
    d.refresh_from_db()
    assert d.statut == StatutDepense.APPROUVEE and d.decide_par == dir_fin2
    # déjà traitée -> 409
    assert api_client.post(reverse("finances:depense-approuver", args=[d.id])).status_code == 409


def test_rejet_demande_un_motif_puis_correction_relance_la_validation(
    api_client, dir_fin, dir_fin2, categorie
):
    d = _depense(categorie, dir_fin)
    api_client.force_authenticate(user=dir_fin2)
    url = reverse("finances:depense-rejeter", args=[d.id])
    assert api_client.post(url, {}, format="json").status_code == 400
    assert api_client.post(url, {"motif": "Beleg fehlt"}, format="json").status_code == 200
    d.refresh_from_db()
    assert d.statut == StatutDepense.REJETEE and d.motif_rejet == "Beleg fehlt"

    api_client.force_authenticate(user=dir_fin)
    r = api_client.patch(
        reverse("finances:depense-detail", args=[d.id]), {"fournisseur": "Neu"}, format="json"
    )
    assert r.status_code == 200
    d.refresh_from_db()
    assert d.statut == StatutDepense.EN_ATTENTE and d.motif_rejet == ""


def test_depense_approuvee_est_figee(api_client, dir_fin, categorie):
    d = _depense(categorie, dir_fin, statut=StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=dir_fin)
    url = reverse("finances:depense-detail", args=[d.id])
    assert api_client.patch(url, {"fournisseur": "X"}, format="json").status_code == 409
    assert api_client.delete(url).status_code == 409


def test_depense_en_attente_supprimable(api_client, dir_fin, categorie):
    d = _depense(categorie, dir_fin)
    api_client.force_authenticate(user=dir_fin)
    assert api_client.delete(reverse("finances:depense-detail", args=[d.id])).status_code == 204


def test_justificatif_format_invalide_refuse(api_client, dir_fin, categorie):
    api_client.force_authenticate(user=dir_fin)
    r = api_client.post(
        reverse("finances:depense-list"),
        {
            "date_depense": "2026-03-10",
            "montant": "10",
            "categorie": str(categorie.id),
            "fournisseur": "x",
            "justificatif": SimpleUploadedFile("a.txt", b"hello world", content_type="text/plain"),
        },
        format="multipart",
    )
    assert r.status_code == 400
    assert "justificatif" in r.data["details"]


def test_budget_definir_et_remise_a_zero(api_client, dir_fin, categorie):
    Gesamtbudget.objects.create(annee=ANNEE, montant=Decimal("1000"))
    api_client.force_authenticate(user=dir_fin)
    url = reverse("finances:budget")
    r = api_client.post(
        url,
        {"annee": ANNEE, "lignes": [{"categorie": str(categorie.id), "montant": "500"}]},
        format="json",
    )
    assert r.status_code == 200 and len(r.data) == 1
    api_client.post(
        url,
        {"annee": ANNEE, "lignes": [{"categorie": str(categorie.id), "montant": "0"}]},
        format="json",
    )
    assert BudgetAnnuel.objects.count() == 0


def test_categorie_utilisee_se_desactive_sans_suppression(api_client, dir_fin, categorie):
    api_client.force_authenticate(user=dir_fin)
    url = reverse("finances:categorie-detail", args=[categorie.id])
    assert api_client.patch(url, {"actif": False}, format="json").status_code == 200
    assert api_client.delete(url).status_code == 405


def test_standardkategorien_sind_uebersetzt():
    cat = CategorieDepense.objects.get(nom="Transport")
    assert cat.namen == {"fr": "Transport", "de": "Transport", "ar": "النقل"}
    autres = CategorieDepense.objects.get(nom="Autres")
    assert autres.namen["de"] == "Sonstiges"
    assert all(c.nom_de and c.nom_ar for c in CategorieDepense.objects.all())


def test_kategorie_namen_rueckfall_auf_franzoesisch():
    cat = CategorieDepense.objects.create(nom="Fournitures spéciales")
    assert cat.namen == {
        "fr": "Fournitures spéciales",
        "de": "Fournitures spéciales",
        "ar": "Fournitures spéciales",
    }


def test_kategorie_uebersetzungen_ueber_api_pflegen(api_client, dir_fin):
    api_client.force_authenticate(user=dir_fin)
    r = api_client.post(
        reverse("finances:categorie-list"),
        {"nom": "Cadeaux", "nom_de": "Geschenke", "nom_ar": "هدايا"},
        format="json",
    )
    assert r.status_code == 201
    assert r.data["namen"] == {"fr": "Cadeaux", "de": "Geschenke", "ar": "هدايا"}
    r = api_client.patch(
        reverse("finances:categorie-detail", args=[r.data["id"]]),
        {"nom_de": "Präsente"},
        format="json",
    )
    assert r.status_code == 200 and r.data["namen"]["de"] == "Präsente"


def test_depense_liefert_kategorie_namen(api_client, dir_fin, categorie):
    categorie.nom_de = "Kategorie DE"
    categorie.save()
    d = _depense(categorie, dir_fin, "10.00", StatutDepense.EN_ATTENTE)
    api_client.force_authenticate(user=dir_fin)
    r = api_client.get(reverse("finances:depense-detail", args=[d.id]))
    assert r.status_code == 200
    assert r.data["categorie_namen"]["de"] == "Kategorie DE"


# --- Jahresbilanz -----------------------------------------------------------------------


def test_bilan_ne_compte_que_les_depenses_approuvees(dir_fin, categorie):
    _depense(categorie, dir_fin, "100.00", StatutDepense.APPROUVEE)
    _depense(categorie, dir_fin, "40.00", StatutDepense.EN_ATTENTE)
    _depense(categorie, dir_fin, "30.00", StatutDepense.REJETEE)
    b = bilan_annuel(ANNEE)
    assert b["depenses"]["total"] == Decimal("100.00")
    assert b["depenses_en_attente"] == {"nombre": 1, "montant": Decimal("40.00")}


def test_bilan_recettes_resultat_et_budget(dir_fin, categorie):
    membre = MembreFactory()
    CotisationFactory(
        membre=membre,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("60.00"),
        date_paiement=timezone.make_aware(datetime.datetime(ANNEE, 2, 5)),
    )
    _depense(categorie, dir_fin, "20.00", StatutDepense.APPROUVEE)
    BudgetAnnuel.objects.create(annee=ANNEE, categorie=categorie, montant=Decimal("25.00"))
    b = bilan_annuel(ANNEE)
    assert b["recettes"]["total"] == Decimal("60.00")
    assert b["resultat"] == Decimal("40.00")
    ligne = next(d for d in b["depenses"]["lignes"] if d["categorie_id"] == str(categorie.id))
    assert ligne["statut_budget"] == "attention"  # 80 % du budget
    assert b["mensuel"][1]["recettes"] == Decimal("60.00")
    assert b["mensuel"][11]["cumul"] == Decimal("40.00")


def test_bilan_resultat_par_evenement_et_projet(dir_fin, categorie):
    ev = EvenementFactory(date_evenement=datetime.date(ANNEE, 6, 1))
    InscriptionFactory(evenement=ev, montant_paye=Decimal("80.00"))
    projet = ProjetFactory()
    _depense(categorie, dir_fin, "30.00", StatutDepense.APPROUVEE, evenement=ev)
    _depense(categorie, dir_fin, "10.00", StatutDepense.APPROUVEE, projet=projet)
    b = bilan_annuel(ANNEE)
    assert b["resultats_evenements"][0]["resultat"] == Decimal("50.00")
    assert b["resultats_projets"][0]["resultat"] == Decimal("-10.00")


def test_bilan_endpoints_et_exports(api_client, dir_fin, categorie):
    _depense(categorie, dir_fin, "20.00", StatutDepense.APPROUVEE)
    api_client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "ba2@example.de"))
    r = api_client.get(reverse("stats:bilan"), {"annee": ANNEE})
    assert r.status_code == 200 and r.data["depenses"]["total"] == Decimal("20.00")
    x = api_client.get(reverse("stats:export-bilan-excel"), {"annee": ANNEE})
    assert x.status_code == 200 and x["Content-Disposition"].endswith('.xlsx"')
    p = api_client.get(reverse("stats:export-bilan-pdf"), {"annee": ANNEE})
    assert p.status_code == 200 and p.content[:4] == b"%PDF"


def test_registre_finances_contient_les_depenses_en_negatif_et_filtre_par_mois(
    api_client, dir_fin, categorie
):
    _depense(
        categorie,
        dir_fin,
        "20.00",
        StatutDepense.APPROUVEE,
        date_depense=datetime.date(ANNEE, 3, 1),
    )
    _depense(
        categorie, dir_fin, "5.00", StatutDepense.APPROUVEE, date_depense=datetime.date(ANNEE, 4, 1)
    )
    api_client.force_authenticate(user=_user(Role.BUREAU_ADMIN, "ba3@example.de"))
    r = api_client.get(
        reverse("stats:finances"), {"annee": ANNEE, "type_transaction": "depense", "mois": 3}
    )
    assert r.status_code == 200
    assert [Decimal(str(x["montant"])) for x in r.data["results"]] == [Decimal("-20.00")]
    assert api_client.get(reverse("stats:finances"), {"mois": 13}).status_code == 400

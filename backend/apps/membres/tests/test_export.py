"""
Tests export Excel du répertoire des membres (demande utilisateur du 2026-09-16, RICEFW
R-002) — voir apps.membres.exports/export_views.
"""

import io
from datetime import date

import openpyxl
import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.membres.models import Bundesland, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def rh_user():
    return User.objects.create_user(
        email="rh@example.de", password="Password123!", role=Role.RH, is_active=True
    )


@pytest.fixture
def bureau_admin_user():
    return User.objects.create_user(
        email="bureau@example.de", password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )


@pytest.fixture
def membre_user():
    return User.objects.create_user(
        email="membre@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _export(api_client, **params):
    return api_client.get(reverse("membres:membre-export"), params)


def _classeur(resp):
    return openpyxl.load_workbook(io.BytesIO(resp.content))


def _lignes(resp):
    feuille = _classeur(resp).active
    lignes = list(feuille.iter_rows(values_only=True))
    return lignes[0], lignes[1:]  # (en-têtes, lignes de données)


# --- Cas nominal ---


def test_export_comme_rh_ok(api_client, rh_user):
    MembreFactory(prenom="Riadh", nom="Bchini", ville_de="Berlin")
    MembreFactory(prenom="Sana", nom="Werfelli", ville_de="Hambourg")

    resp = _export(_auth(api_client, rh_user))

    assert resp.status_code == 200
    assert resp["Content-Type"] == XLSX_MIME
    assert "export_membres_" in resp["Content-Disposition"]
    assert ".xlsx" in resp["Content-Disposition"]

    entetes, lignes = _lignes(resp)
    assert entetes[0] == "N° membre"
    assert "Statut" in entetes
    assert len(lignes) == 2


def test_export_comme_bureau_admin_ok(api_client, bureau_admin_user):
    MembreFactory()
    resp = _export(_auth(api_client, bureau_admin_user))
    assert resp.status_code == 200


def test_export_cin_toujours_masque(api_client, rh_user):
    MembreFactory(cin="99998888")
    resp = _export(_auth(api_client, rh_user))
    entetes, lignes = _lignes(resp)
    idx_cin = entetes.index("CIN")
    assert lignes[0][idx_cin] == "•••••888"
    assert "99998888" not in str(lignes[0])


def test_export_colonne_cotisation_annee_en_cours(api_client, rh_user):
    membre_paye = MembreFactory()
    membre_impaye = MembreFactory()
    annee_courante = date.today().year
    Cotisation.objects.create(
        membre=membre_paye,
        type_article=TypeArticle.COTISATION,
        libelle="Cotisation annuelle",
        montant="45.00",
        statut=StatutCotisation.PAYEE,
        annee=annee_courante,
    )

    resp = _export(_auth(api_client, rh_user))
    entetes, lignes = _lignes(resp)
    idx_cotisation = entetes.index(f"Cotisation {annee_courante}")
    idx_email = entetes.index("Email")
    valeurs_par_email = {ligne[idx_email]: ligne[idx_cotisation] for ligne in lignes}
    assert valeurs_par_email[membre_paye.email] == "Payée"
    assert valeurs_par_email[membre_impaye.email] == "En attente"


# --- Filtrage (même FilterSet que GET /membres/) ---


def test_export_filtre_par_statut(api_client, rh_user):
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.INACTIF)

    resp = _export(_auth(api_client, rh_user), statut=StatutMembre.ACTIF)
    _, lignes = _lignes(resp)
    assert len(lignes) == 1


def test_export_filtre_par_ville(api_client, rh_user):
    MembreFactory(ville_de="Berlin")
    MembreFactory(ville_de="Munich")

    resp = _export(_auth(api_client, rh_user), ville="berl")
    _, lignes = _lignes(resp)
    assert len(lignes) == 1


def test_export_filtre_recherche_q(api_client, rh_user):
    MembreFactory(prenom="Ahmed", nom="Zribi")
    MembreFactory(prenom="Sana", nom="Werfelli")

    resp = _export(_auth(api_client, rh_user), q="zribi")
    _, lignes = _lignes(resp)
    assert len(lignes) == 1


# --- Tri ---


def test_export_tri_par_defaut_nom_prenom(api_client, rh_user):
    MembreFactory(nom="Zribi", prenom="Ahmed")
    MembreFactory(nom="Bchini", prenom="Riadh")

    resp = _export(_auth(api_client, rh_user))
    entetes, lignes = _lignes(resp)
    idx_nom = entetes.index("Nom")
    assert [ligne[idx_nom] for ligne in lignes] == ["Bchini", "Zribi"]


def test_export_tri_descendant_par_date_adhesion(api_client, rh_user):
    MembreFactory(nom="Ancien", date_adhesion=date(2018, 1, 1))
    MembreFactory(nom="Recent", date_adhesion=date(2024, 1, 1))

    resp = _export(_auth(api_client, rh_user), ordering="-date_adhesion")
    entetes, lignes = _lignes(resp)
    idx_nom = entetes.index("Nom")
    assert [ligne[idx_nom] for ligne in lignes] == ["Recent", "Ancien"]


def test_export_tri_champ_inconnu_retombe_sur_le_defaut(api_client, rh_user):
    MembreFactory(nom="Zribi")
    MembreFactory(nom="Bchini")

    resp = _export(_auth(api_client, rh_user), ordering="mot_de_passe")
    assert resp.status_code == 200
    entetes, lignes = _lignes(resp)
    idx_nom = entetes.index("Nom")
    assert [ligne[idx_nom] for ligne in lignes] == ["Bchini", "Zribi"]


# --- Permissions (IDOR / RBAC) ---


def test_export_comme_membre_refuse_403(api_client, membre_user):
    resp = _export(_auth(api_client, membre_user))
    assert resp.status_code == 403


def test_export_non_authentifie_401(api_client):
    resp = _export(api_client)
    assert resp.status_code == 401


def test_export_land_de_vide_ne_leve_pas_erreur(api_client, rh_user):
    # land_de blank=True (voir Membre) — get_land_de_display() sur une valeur vide ne doit pas
    # planter (choices ne couvre pas la chaîne vide) : la vue doit gérer ce cas explicitement.
    MembreFactory(land_de="")
    resp = _export(_auth(api_client, rh_user))
    assert resp.status_code == 200


def test_export_bundesland_affiche_le_libelle_complet(api_client, rh_user):
    MembreFactory(land_de=Bundesland.BAYERN)
    resp = _export(_auth(api_client, rh_user))
    entetes, lignes = _lignes(resp)
    idx_land = entetes.index("Land")
    assert lignes[0][idx_land] == "Bayern"

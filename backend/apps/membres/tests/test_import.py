"""
Tests import Excel des membres (RICEFW C-001/W-008).
"""

import io

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import Membre, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

DEFAULT_HEADERS = [
    "prenom",
    "nom",
    "date_naissance",
    "sexe",
    "email",
    "telephone",
    "cin",
    "passeport",
    "adresse_de",
    "code_postal_de",
    "ville_de",
    "land_de",
    "ville_origine_tn",
    "gouvernorat_tn",
    "statut",
    "date_adhesion",
]


def _xlsx_file(rows, headers=None, filename="import.xlsx"):
    headers = headers if headers is not None else DEFAULT_HEADERS
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile(filename, buf.getvalue(), content_type=XLSX_MIME)


def _ligne(
    prenom="Ahmed",
    nom="Zribi",
    date_naissance="15/03/1985",
    sexe="Homme",
    email="ahmed.zribi@example.de",
    telephone="+49 170 1111111",
    cin="10000001",
    passeport="",
    adresse_de="Musterstr. 1",
    code_postal_de="10115",
    ville_de="Berlin",
    land_de="BE",
    ville_origine_tn="Tunis",
    gouvernorat_tn="Tunis",
    statut="",
    date_adhesion="01/09/2020",
):
    return [
        prenom,
        nom,
        date_naissance,
        sexe,
        email,
        telephone,
        cin,
        passeport,
        adresse_de,
        code_postal_de,
        ville_de,
        land_de,
        ville_origine_tn,
        gouvernorat_tn,
        statut,
        date_adhesion,
    ]


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def rh_user():
    return User.objects.create_user(
        email="rh@example.de", password="Password123!", role=Role.RH, is_active=True
    )


@pytest.fixture
def membre_user():
    return User.objects.create_user(
        email="membre@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _import(api_client, fichier):
    return api_client.post(
        reverse("membres:membre-import"), {"fichier": fichier}, format="multipart"
    )


# --- Cas nominal ---


def test_import_plusieurs_lignes_valides(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="10000001", nom="Zribi"),
            _ligne(email="b@example.de", cin="10000002", nom="Bchini"),
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 200
    assert resp.data == {"total": 2, "importes": 2, "ignores": 0, "erreurs": []}
    assert Membre.objects.count() == 2


def test_import_genere_numero_membre_et_defaut_statut_actif(api_client, rh_user):
    fichier = _xlsx_file([_ligne(email="a@example.de", cin="10000001", statut="")])
    _import(_auth(api_client, rh_user), fichier)
    membre = Membre.objects.get(email="a@example.de")
    assert membre.numero_membre.startswith("CA-2020-")  # année de date_adhesion (01/09/2020)
    assert membre.statut == StatutMembre.ACTIF


def test_import_land_de_accepte_code_et_nom_complet(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="10000001", land_de="BE"),
            _ligne(email="b@example.de", cin="10000002", land_de="Bayern"),
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 2
    assert Membre.objects.get(email="a@example.de").land_de == "BE"
    assert Membre.objects.get(email="b@example.de").land_de == "BY"


# --- Erreurs ligne par ligne (import "best effort", pas tout-ou-rien) ---


def test_import_ligne_avec_champ_obligatoire_manquant_est_ignoree(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="10000001"),
            _ligne(email="b@example.de", cin="10000002", nom=""),  # nom manquant
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 200
    assert resp.data["importes"] == 1
    assert resp.data["ignores"] == 1
    assert len(resp.data["erreurs"]) == 1
    assert resp.data["erreurs"][0]["ligne"] == 3  # ligne 2 = en-têtes, données à partir de 2... +1
    assert Membre.objects.count() == 1


def test_import_land_de_invalide_ignore_la_ligne(api_client, rh_user):
    fichier = _xlsx_file([_ligne(email="a@example.de", cin="10000001", land_de="Atlantide")])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 0
    assert resp.data["ignores"] == 1
    assert Membre.objects.count() == 0


def test_import_email_invalide_ignore_la_ligne(api_client, rh_user):
    fichier = _xlsx_file([_ligne(email="pas-un-email", cin="10000001")])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 0
    assert resp.data["ignores"] == 1


def test_import_lignes_vides_sont_ignorees_silencieusement(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="10000001"),
            [None] * len(DEFAULT_HEADERS),
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["total"] == 1  # la ligne vide n'est pas comptée
    assert resp.data["importes"] == 1


# --- Doublons (SCD/W-008 : "valider schéma + doublons email/CIN") ---


def test_import_doublon_cin_dans_le_meme_fichier(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="10000001"),
            _ligne(email="a2@example.de", cin="10000001"),  # même CIN, email différent
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 1
    assert resp.data["ignores"] == 1
    assert Membre.objects.count() == 1


def test_import_doublon_avec_membre_deja_en_base(api_client, rh_user):
    MembreFactory(email="existant@example.de", cin="99999999")
    fichier = _xlsx_file([_ligne(email="existant@example.de", cin="99999999")])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 0
    assert resp.data["ignores"] == 1
    assert Membre.objects.count() == 1  # pas de doublon créé


# --- CIN et téléphone facultatifs (décision du 2026-10-07) ---


def test_import_sans_cin_ni_telephone_reussit(api_client, rh_user):
    fichier = _xlsx_file(
        [
            _ligne(email="a@example.de", cin="", telephone=""),
            _ligne(
                email="b@example.de", cin=None, telephone=None
            ),  # 2 lignes sans CIN : pas un doublon
        ]
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 200
    assert resp.data["importes"] == 2
    assert resp.data["erreurs"] == []
    membre = Membre.objects.get(email="a@example.de")
    assert not membre.cin
    assert membre.telephone == ""


def test_import_colonnes_cin_et_telephone_absentes_du_fichier(api_client, rh_user):
    idx = [DEFAULT_HEADERS.index("cin"), DEFAULT_HEADERS.index("telephone")]
    headers = [h for i, h in enumerate(DEFAULT_HEADERS) if i not in idx]
    ligne = [v for i, v in enumerate(_ligne(email="a@example.de")) if i not in idx]
    resp = _import(_auth(api_client, rh_user), _xlsx_file([ligne], headers=headers))
    assert resp.status_code == 200
    assert resp.data["importes"] == 1


def test_import_cin_et_telephone_numeriques_excel(api_client, rh_user):
    fichier = _xlsx_file([_ligne(email="a@example.de", cin=12345678.0, telephone=4917011111)])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 1
    membre = Membre.objects.get(email="a@example.de")
    assert membre.cin == "12345678"
    assert membre.telephone == "4917011111"


def test_import_membre_en_base_sans_cin_ne_bloque_pas_les_lignes_sans_cin(api_client, rh_user):
    MembreFactory(email="existant@example.de", cin=None)
    fichier = _xlsx_file([_ligne(email="nouveau@example.de", cin="")])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.data["importes"] == 1


# --- Validation fichier / permissions ---


def test_import_colonne_obligatoire_manquante_400(api_client, rh_user):
    headers_incomplets = [h for h in DEFAULT_HEADERS if h != "email"]
    fichier = _xlsx_file([], headers=headers_incomplets)
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 400
    assert resp.data["code"] == "schema_invalide"


def test_import_fichier_non_excel_rejete_400(api_client, rh_user):
    fichier = SimpleUploadedFile(
        "import.xlsx", b"ceci n'est pas un fichier excel", content_type=XLSX_MIME
    )
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 400
    assert resp.data["code"] == "type_fichier_invalide"


def test_import_sans_fichier_400(api_client, rh_user):
    _auth(api_client, rh_user)
    resp = api_client.post(reverse("membres:membre-import"), {}, format="multipart")
    assert resp.status_code == 400
    assert resp.data["code"] == "fichier_requis"


def test_import_comme_membre_refuse_403(api_client, membre_user):
    fichier = _xlsx_file([_ligne()])
    resp = _import(_auth(api_client, membre_user), fichier)
    assert resp.status_code == 403


def test_import_non_authentifie_401(api_client):
    fichier = _xlsx_file([_ligne()])
    resp = api_client.post(
        reverse("membres:membre-import"), {"fichier": fichier}, format="multipart"
    )
    assert resp.status_code == 401


# --- Téléchargement du template (RICEFW W-008/F-019) ---


def test_telechargement_template_comme_rh_ok(api_client, rh_user):
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-import-template"))

    assert resp.status_code == 200
    assert resp["Content-Type"] == XLSX_MIME
    assert "template_import_membres.xlsx" in resp["Content-Disposition"]

    classeur = openpyxl.load_workbook(io.BytesIO(resp.content))
    en_tetes = next(classeur.active.iter_rows(values_only=True))
    assert set(DEFAULT_HEADERS) <= set(en_tetes)


def test_telechargement_template_comme_membre_refuse_403(api_client, membre_user):
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-import-template"))
    assert resp.status_code == 403


def test_telechargement_template_non_authentifie_401(api_client):
    resp = api_client.get(reverse("membres:membre-import-template"))
    assert resp.status_code == 401

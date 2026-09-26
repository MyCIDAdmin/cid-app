"""
Tests import Excel de l'historique de statut associatif par année (demande utilisateur du
2026-09-19) — voir apps.membres.imports_historique.
"""

import io

import openpyxl
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.imports_historique import ImportHistoriqueSchemaError, importer_historique_statuts
from apps.membres.models import HistoriqueStatutMembre, RaisonChangementStatut, StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx_file(headers, rows, filename="historique.xlsx"):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile(filename, buf.getvalue(), content_type=XLSX_MIME)


# --- Fonction pure (importer_historique_statuts) ---


def test_import_une_colonne_par_annee():
    membre = MembreFactory(email="riadh@example.de", cin="11112222", statut=StatutMembre.EN_ATTENTE)
    fichier = _xlsx_file(
        ["email", "cin", "2023", "2024", "2025"],
        [["riadh@example.de", "11112222", "inactif", "actif", "actif"]],
    )

    resultat = importer_historique_statuts(fichier)

    assert resultat.total == 1
    assert resultat.lignes_traitees == 1
    assert resultat.entrees_importees == 3
    assert resultat.erreurs == []

    entrees = {h.annee: h.statut for h in HistoriqueStatutMembre.objects.filter(membre=membre)}
    assert entrees == {
        2023: StatutMembre.INACTIF,
        2024: StatutMembre.ACTIF,
        2025: StatutMembre.ACTIF,
    }
    for h in HistoriqueStatutMembre.objects.filter(membre=membre):
        assert h.raison == RaisonChangementStatut.MANUEL

    membre.refresh_from_db()
    assert membre.statut == StatutMembre.ACTIF  # année la plus récente (2025) synchronisée


def test_import_ne_notifie_pas_et_nenvoie_pas_demail(mailoutbox):
    from apps.accounts.models import User as UserModel
    from apps.notifications.models import Notification

    user = UserModel.objects.create_user(
        email="silencieux@example.de", password="Password123!", is_active=True
    )
    MembreFactory(
        user=user, email="silencieux@example.de", cin="99998888", statut=StatutMembre.INACTIF
    )
    fichier = _xlsx_file(["email", "cin", "2026"], [["silencieux@example.de", "99998888", "actif"]])

    importer_historique_statuts(fichier)

    assert Notification.objects.count() == 0
    assert len(mailoutbox) == 0


def test_import_ecrase_une_entree_existante():
    membre = MembreFactory(email="ecrase@example.de", cin="55556666")
    HistoriqueStatutMembre.objects.create(
        membre=membre,
        annee=2024,
        statut=StatutMembre.INACTIF,
        raison=RaisonChangementStatut.ECHEANCE_DEPASSEE,
        date_effet="2024-01-01T00:00:00Z",
    )
    fichier = _xlsx_file(["email", "cin", "2024"], [["ecrase@example.de", "55556666", "actif"]])

    importer_historique_statuts(fichier)

    entree = HistoriqueStatutMembre.objects.get(membre=membre, annee=2024)
    assert entree.statut == StatutMembre.ACTIF
    assert entree.raison == RaisonChangementStatut.MANUEL


def test_import_cellule_vide_est_ignoree():
    membre = MembreFactory(email="vide@example.de", cin="77778888")
    fichier = _xlsx_file(
        ["email", "cin", "2024", "2025"], [["vide@example.de", "77778888", "actif", ""]]
    )

    resultat = importer_historique_statuts(fichier)

    assert resultat.entrees_importees == 1
    assert HistoriqueStatutMembre.objects.filter(membre=membre).count() == 1
    assert not HistoriqueStatutMembre.objects.filter(membre=membre, annee=2025).exists()


def test_import_valeur_invalide_est_une_erreur_de_ligne():
    MembreFactory(email="invalide@example.de", cin="12123434")
    fichier = _xlsx_file(
        ["email", "cin", "2024"], [["invalide@example.de", "12123434", "peut-etre"]]
    )

    resultat = importer_historique_statuts(fichier)

    assert resultat.entrees_importees == 0
    assert len(resultat.erreurs) == 1
    assert "2024" in resultat.erreurs[0].message


def test_import_membre_introuvable_est_une_erreur_de_ligne():
    fichier = _xlsx_file(["email", "cin", "2024"], [["inconnu@example.de", "00000000", "actif"]])

    resultat = importer_historique_statuts(fichier)

    assert resultat.total == 1
    assert resultat.lignes_ignorees == 1
    assert len(resultat.erreurs) == 1


def test_import_email_et_cin_pointant_vers_2_membres_differents_est_ambigu():
    MembreFactory(email="a@example.de", cin="11111111")
    MembreFactory(email="b@example.de", cin="22222222")
    fichier = _xlsx_file(["email", "cin", "2024"], [["a@example.de", "22222222", "actif"]])

    resultat = importer_historique_statuts(fichier)

    assert resultat.lignes_ignorees == 1
    assert "différents" in resultat.erreurs[0].message


def test_import_seul_le_cin_correspond_suffit():
    membre = MembreFactory(email="ancien-mail@example.de", cin="33334444")
    # email changé depuis, mais le cin permet quand même de retrouver le membre.
    fichier = _xlsx_file(
        ["email", "cin", "2024"], [["autre-email@example.de", "33334444", "actif"]]
    )

    resultat = importer_historique_statuts(fichier)

    assert resultat.entrees_importees == 1
    assert HistoriqueStatutMembre.objects.filter(membre=membre, annee=2024).exists()


def test_import_ligne_vide_est_ignoree_silencieusement():
    fichier = _xlsx_file(["email", "cin", "2024"], [[None, None, None]])

    resultat = importer_historique_statuts(fichier)

    assert resultat.total == 0
    assert resultat.erreurs == []


def test_import_ne_touche_pas_le_statut_courant_pour_un_rattrapage_ancien():
    membre = MembreFactory(
        email="rattrapage@example.de", cin="66667777", statut=StatutMembre.INACTIF
    )
    HistoriqueStatutMembre.objects.create(
        membre=membre,
        annee=2026,
        statut=StatutMembre.INACTIF,
        raison=RaisonChangementStatut.ECHEANCE_DEPASSEE,
        date_effet="2026-01-01T00:00:00Z",
    )
    fichier = _xlsx_file(["email", "cin", "2023"], [["rattrapage@example.de", "66667777", "actif"]])

    importer_historique_statuts(fichier)

    membre.refresh_from_db()
    assert membre.statut == StatutMembre.INACTIF  # 2023 < 2026 déjà connu : inchangé
    assert (
        HistoriqueStatutMembre.objects.get(membre=membre, annee=2023).statut == StatutMembre.ACTIF
    )


def test_import_sans_colonnes_obligatoires_leve_schema_error():
    fichier = _xlsx_file(["prenom", "2024"], [["Riadh", "actif"]])

    with pytest.raises(ImportHistoriqueSchemaError):
        importer_historique_statuts(fichier)


def test_import_sans_colonne_annee_leve_schema_error():
    fichier = _xlsx_file(["email", "cin"], [["riadh@example.de", "11112222"]])

    with pytest.raises(ImportHistoriqueSchemaError):
        importer_historique_statuts(fichier)


# --- Vue API ---


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def rh_user():
    return User.objects.create_user(
        email="rh-hist@example.de", password="Password123!", role=Role.RH, is_active=True
    )


@pytest.fixture
def membre_user():
    return User.objects.create_user(
        email="membre-hist@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _import(api_client, fichier):
    return api_client.post(
        reverse("membres:membre-import-historique"), {"fichier": fichier}, format="multipart"
    )


def test_vue_import_ok(api_client, rh_user):
    MembreFactory(email="vue@example.de", cin="10101010")
    fichier = _xlsx_file(["email", "cin", "2025"], [["vue@example.de", "10101010", "actif"]])

    resp = _import(_auth(api_client, rh_user), fichier)

    assert resp.status_code == 200, resp.data
    assert resp.data["entrees_importees"] == 1


def test_vue_import_comme_membre_refuse_403(api_client, membre_user):
    fichier = _xlsx_file(["email", "cin", "2025"], [["x@example.de", "1", "actif"]])
    resp = _import(_auth(api_client, membre_user), fichier)
    assert resp.status_code == 403


def test_vue_import_non_authentifie_401(api_client):
    fichier = _xlsx_file(["email", "cin", "2025"], [["x@example.de", "1", "actif"]])
    resp = _import(api_client, fichier)
    assert resp.status_code == 401


def test_vue_import_colonnes_manquantes_400(api_client, rh_user):
    fichier = _xlsx_file(["prenom"], [["Riadh"]])
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 400
    assert resp.data["code"] == "schema_invalide"


def test_vue_import_fichier_non_excel_rejete_400(api_client, rh_user):
    fichier = SimpleUploadedFile("f.txt", b"pas un excel", content_type="text/plain")
    resp = _import(_auth(api_client, rh_user), fichier)
    assert resp.status_code == 400
    assert resp.data["code"] == "type_fichier_invalide"


def test_vue_telechargement_template_comme_rh_ok(api_client, rh_user):
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-import-historique-template"))
    assert resp.status_code == 200
    assert resp["Content-Type"] == XLSX_MIME


def test_vue_telechargement_template_comme_membre_refuse_403(api_client, membre_user):
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-import-historique-template"))
    assert resp.status_code == 403

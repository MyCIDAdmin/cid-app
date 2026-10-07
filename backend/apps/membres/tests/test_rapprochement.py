"""
Tests du rapprochement comptes inscrits <-> fiches importées (apps.membres.rapprochement).
"""

import datetime

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts import services
from apps.accounts.models import Role, User
from apps.membres.models import HistoriqueStatutMembre, Membre, RaisonChangementStatut, StatutMembre
from apps.membres.rapprochement import (
    RapprochementError,
    candidats_pour,
    evaluer,
    fusionner,
    inscrits_a_rapprocher,
    lier_automatiquement,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _importe(**kw):
    """Fiche importée : sans compte."""
    defaults = {"user": None, "statut": StatutMembre.ACTIF}
    defaults.update(kw)
    return MembreFactory(**defaults)


def _inscrit(email="inscrit@example.de", **kw):
    user = User.objects.create_user(
        email=email, password="Password123!", role=Role.MEMBRE, is_active=True
    )
    defaults = {"user": user, "email": email, "statut": StatutMembre.EN_ATTENTE}
    defaults.update(kw)
    return MembreFactory(**defaults)


# --- Scoring ---------------------------------------------------------------


def test_evaluer_email_identique_donne_100_insensible_a_la_casse():
    importe = _importe(email="Sami.BenSalah@Example.de")
    inscrit = _inscrit(email="sami.bensalah@example.de", prenom="X", nom="Y", cin="1")
    c = evaluer(inscrit, importe)
    assert c.score == 100
    assert "email" in c.raisons


def test_evaluer_cin_identique_donne_90_sans_atteindre_100():
    importe = _importe(email="a@example.de", cin="AB12345", prenom="Aaa", nom="Bbb")
    inscrit = _inscrit(email="b@example.de", cin="ab 12345", prenom="Ccc", nom="Ddd")
    c = evaluer(inscrit, importe)
    assert c.raisons == ["cin"]
    assert c.score == 90


def test_evaluer_nom_exact_sans_accents_ni_casse():
    importe = _importe(email="a@example.de", cin="1", prenom="Éric", nom="Ben-Ali")
    inscrit = _inscrit(email="b@example.de", cin="2", prenom="eric", nom="BEN ALI")
    c = evaluer(inscrit, importe)
    assert "nom" in c.raisons
    assert c.score == 60


def test_evaluer_nom_et_prenom_inverses_sont_reconnus():
    importe = _importe(email="a@example.de", cin="1", prenom="Sami", nom="Trabelsi")
    inscrit = _inscrit(email="b@example.de", cin="2", prenom="Trabelsi", nom="Sami")
    assert "nom" in evaluer(inscrit, importe).raisons


def test_evaluer_date_de_naissance_renforce_le_nom_mais_pas_seule():
    jour = datetime.date(1990, 5, 12)
    importe = _importe(email="a@example.de", cin="1", prenom="Sami", nom="Trabelsi")
    importe.date_naissance = jour
    inscrit = _inscrit(email="b@example.de", cin="2", prenom="Sami", nom="Trabelsi")
    inscrit.date_naissance = jour
    c = evaluer(inscrit, importe)
    assert c.score == 85
    assert "date_naissance" in c.raisons

    autre = _importe(email="c@example.de", cin="3", prenom="Zzz", nom="Yyy")
    autre.date_naissance = jour
    assert evaluer(inscrit, autre) is None


def test_evaluer_plusieurs_criteres_prennent_le_meilleur_plus_bonus_plafonne_a_99():
    jour = datetime.date(1990, 5, 12)
    importe = _importe(email="a@example.de", cin="777", prenom="Sami", nom="Trabelsi")
    importe.date_naissance = jour
    inscrit = _inscrit(email="b@example.de", cin="777", prenom="Sami", nom="Trabelsi")
    inscrit.date_naissance = jour
    c = evaluer(inscrit, importe)
    assert set(c.raisons) == {"cin", "nom", "date_naissance"}
    assert c.score == 99


def test_evaluer_aucun_critere_renvoie_none():
    importe = _importe(email="a@example.de", cin="1", prenom="Aaa", nom="Bbb")
    inscrit = _inscrit(email="b@example.de", cin="2", prenom="Xxx", nom="Yyy")
    assert evaluer(inscrit, importe) is None


def test_candidats_pour_trie_par_score_et_ignore_les_fiches_avec_compte():
    inscrit = _inscrit(email="s@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    _importe(email="x1@example.de", cin="555", prenom="Autre", nom="Nom")  # CIN -> 90
    _importe(email="x2@example.de", cin="1", prenom="Sami", nom="Trabelsi")  # nom -> 60
    _inscrit(email="deja@example.de", cin="555")  # a un compte : jamais candidat
    scores = [c.score for c in candidats_pour(inscrit)]
    assert scores == [90, 60]


# --- Liaison automatique ---------------------------------------------------


def test_lier_automatiquement_email_unique_conserve_numero_statut_et_historique():
    importe = _importe(email="Sami@Example.de", statut=StatutMembre.ACTIF, cin="999")
    numero, adhesion = importe.numero_membre, importe.date_adhesion
    inscrit = _inscrit(email="sami@example.de", cin="123", telephone="+49 111", prenom="Sami")
    user = inscrit.user

    conserve = lier_automatiquement(inscrit)

    assert conserve.pk == importe.pk
    importe.refresh_from_db()
    assert importe.user_id == user.id
    assert importe.email == "sami@example.de"
    assert importe.numero_membre == numero
    assert importe.date_adhesion == adhesion
    assert importe.statut == StatutMembre.ACTIF  # statut importé conservé
    assert not Membre.objects.filter(pk=inscrit.pk).exists()
    assert Membre.objects.filter(user=user).count() == 1


def test_lier_automatiquement_les_donnees_saisies_ecrasent_celles_de_l_import():
    importe = _importe(
        email="sami@example.de",
        prenom="Samy",
        nom="Ben Salah",
        cin="999",
        telephone="+49 000",
        ville_de="Hamburg",
    )
    inscrit = _inscrit(
        email="sami@example.de",
        prenom="Sami",
        nom="Bensalah",
        cin="4242",
        telephone="+49 111",
        ville_de="Berlin",
    )
    lier_automatiquement(inscrit)
    importe.refresh_from_db()
    assert (importe.prenom, importe.nom) == ("Sami", "Bensalah")
    assert importe.cin == "4242"
    assert importe.telephone == "+49 111"
    assert importe.ville_de == "Berlin"


def test_lier_automatiquement_un_champ_vide_n_efface_pas_la_valeur_importee():
    importe = _importe(email="sami@example.de", cin="999", passeport="P-IMPORT", land_de="BY")
    inscrit = _inscrit(email="sami@example.de", cin="", passeport="", land_de="")
    lier_automatiquement(inscrit)
    importe.refresh_from_db()
    assert importe.cin == "999"
    assert importe.passeport == "P-IMPORT"
    assert importe.land_de == "BY"


def test_lier_automatiquement_ambigu_ne_fait_rien():
    _importe(email="sami@example.de")
    _importe(email="SAMI@example.de")
    inscrit = _inscrit(email="sami@example.de")
    assert lier_automatiquement(inscrit) is None
    assert Membre.objects.filter(pk=inscrit.pk).exists()


def test_lier_automatiquement_sans_correspondance_email_ne_fait_rien():
    _importe(email="autre@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    inscrit = _inscrit(email="sami@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    # CIN et nom identiques mais email différent : suggestion seulement, jamais automatique.
    assert lier_automatiquement(inscrit) is None
    assert Membre.objects.filter(pk=inscrit.pk).exists()


def test_register_confirm_lie_automatiquement_la_fiche_importee(api_client=None):
    client = APIClient()
    importe = _importe(email="nouveau@example.com", statut=StatutMembre.INACTIF)
    resp = client.post(
        reverse("accounts:register"),
        {
            "email": "nouveau@example.com",
            "password": "Password123!",
            "langue_preferee": "fr",
            "consentement_rgpd": True,
            "prenom": "Sami",
            "nom": "Ben Salah",
            "date_naissance": "1990-05-12",
            "cin": "12345678",
            "telephone": "+49123456789",
            "adresse_de": "Friedrichstr. 42",
            "ville_de": "Berlin",
        },
        format="json",
    )
    assert resp.status_code == 201
    user = User.objects.get(email="nouveau@example.com")
    code = services.generate_email_otp(user, purpose="email_verification")
    resp = client.post(
        reverse("accounts:register-confirm"), {"email": user.email, "code": code}, format="json"
    )
    assert resp.status_code == 200
    importe.refresh_from_db()
    assert importe.user_id == user.id
    assert importe.statut == StatutMembre.INACTIF
    assert Membre.objects.filter(email__iexact="nouveau@example.com").count() == 1


# --- fusionner -------------------------------------------------------------


def test_fusionner_reporte_historique_et_garde_celui_de_la_fiche_importee():
    importe = _importe(email="a@example.de")
    inscrit = _inscrit(email="b@example.de")
    HistoriqueStatutMembre.objects.create(
        membre=importe,
        annee=2023,
        statut=StatutMembre.ACTIF,
        raison=RaisonChangementStatut.MANUEL,
        date_effet="2023-01-01T00:00:00Z",
    )
    HistoriqueStatutMembre.objects.create(
        membre=inscrit,
        annee=2023,
        statut=StatutMembre.INACTIF,
        raison=RaisonChangementStatut.MANUEL,
        date_effet="2023-01-01T00:00:00Z",
    )
    HistoriqueStatutMembre.objects.create(
        membre=inscrit,
        annee=2024,
        statut=StatutMembre.ACTIF,
        raison=RaisonChangementStatut.MANUEL,
        date_effet="2024-01-01T00:00:00Z",
    )
    fusionner(inscrit, importe)
    annees = {h.annee: h.statut for h in importe.historique_statuts.all()}
    assert annees == {2023: StatutMembre.ACTIF, 2024: StatutMembre.ACTIF}


def test_fusionner_refuse_une_fiche_deja_liee():
    a = _inscrit(email="a@example.de")
    b = _inscrit(email="b@example.de")
    with pytest.raises(RapprochementError):
        fusionner(a, b)


# --- API ---------------------------------------------------------------------


@pytest.fixture
def rh_client():
    user = User.objects.create_user(
        email="rh@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_api_liste_propose_les_candidats_avec_score(rh_client):
    importe = _importe(email="a@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    inscrit = _inscrit(email="b@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    _inscrit(email="seul@example.de", cin="9", prenom="Pas", nom="Detreffer")
    resp = rh_client.get(reverse("membres:membre-rapprochement"))
    assert resp.status_code == 200
    assert resp.data["count"] == 1
    ligne = resp.data["results"][0]
    assert ligne["inscrit"]["id"] == str(inscrit.pk)
    assert ligne["candidats"][0]["id"] == str(importe.pk)
    assert ligne["candidats"][0]["score"] >= 90
    assert "cin" in ligne["candidats"][0]["raisons"]
    assert "cin" not in str(ligne["candidats"][0].keys())


def test_api_fusionner_puis_liste_vide(rh_client):
    importe = _importe(email="a@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    inscrit = _inscrit(email="b@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    user = inscrit.user
    resp = rh_client.post(
        reverse("membres:membre-rapprochement-fusionner"),
        {"inscrit_id": str(inscrit.pk), "importe_id": str(importe.pk)},
        format="json",
    )
    assert resp.status_code == 200
    importe.refresh_from_db()
    assert importe.user_id == user.id
    assert inscrits_a_rapprocher() == []


def test_api_ecarter_retire_de_la_liste(rh_client):
    _importe(email="a@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    inscrit = _inscrit(email="b@example.de", cin="555", prenom="Sami", nom="Trabelsi")
    resp = rh_client.post(
        reverse("membres:membre-rapprochement-ecarter"),
        {"inscrit_id": str(inscrit.pk)},
        format="json",
    )
    assert resp.status_code == 204
    assert rh_client.get(reverse("membres:membre-rapprochement")).data["count"] == 0


def test_api_reservee_rh_plus():
    membre = User.objects.create_user(
        email="m@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=membre)
    assert client.get(reverse("membres:membre-rapprochement")).status_code == 403
    assert (
        client.post(
            reverse("membres:membre-rapprochement-ecarter"), {"inscrit_id": "x"}, format="json"
        ).status_code
        == 403
    )
    anonyme = APIClient()
    assert anonyme.get(reverse("membres:membre-rapprochement")).status_code in (401, 403)

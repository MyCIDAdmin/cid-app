"""
Tests API — app membres (TDD §2.4, SCD §2.3 A01 : "test obligatoire en
CI/CD : cas de test DRF vérifiant qu'un membre A ne peut pas lire les
données de membre B").
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user(role, email):
    return User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)


@pytest.fixture
def membre_user():
    return _user(Role.MEMBRE, "simple.membre@example.de")


@pytest.fixture
def rh_user():
    return _user(Role.RH, "rh@example.de")


@pytest.fixture
def bureau_admin_user():
    return _user(Role.BUREAU_ADMIN, "bureau@example.de")


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _payload(**overrides):
    data = {
        "prenom": "Riadh",
        "nom": "Bchini",
        "date_naissance": "1990-05-12",
        "email": "riadh.bchini@example.de",
        "telephone": "+49 170 1234567",
        "cin": "11223344",
        "adresse_de": "Teststr. 1",
        "ville_de": "Berlin",
        "land_de": "BE",
    }
    data.update(overrides)
    return data


# --- Authentification ---


def test_list_non_authentifie_refuse(api_client):
    url = reverse("membres:membre-list")
    resp = api_client.get(url)
    assert resp.status_code == 401


# --- Scope liste / IDOR (SCD §2.3 A01) ---


def test_list_comme_rh_retourne_tous_les_membres(api_client, rh_user):
    MembreFactory.create_batch(3)
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 3


def test_list_comme_membre_ne_retourne_que_sa_propre_fiche(api_client, membre_user):
    MembreFactory.create_batch(2)  # d'autres fiches, sans lien à membre_user
    ma_fiche = MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-list"))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["id"] == str(ma_fiche.id)


def test_retrieve_fiche_d_un_autre_membre_refuse(api_client, membre_user):
    """
    404 et non 403 : le queryset scope (get_queryset) exclut déjà les fiches
    d'autrui pour un rôle < RH, donc get_object() ne les trouve jamais. C'est
    volontaire (SCD §2.3 A01) — un 403 confirmerait l'existence de la fiche
    ciblée à un appelant non autorisé, un 404 ne révèle rien.
    """
    autre = MembreFactory()
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-detail", args=[autre.id]))
    assert resp.status_code == 404


def test_retrieve_sa_propre_fiche_ok(api_client, membre_user):
    ma_fiche = MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-detail", args=[ma_fiche.id]))
    assert resp.status_code == 200
    assert resp.data["id"] == str(ma_fiche.id)


# --- Masquage CIN/passeport (SCD §5.1, A02) ---


def test_cin_masque_pour_membre_consultant_un_autre_via_rh(api_client, rh_user):
    membre = MembreFactory(cin="99887766")
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-detail", args=[membre.id]))
    assert resp.status_code == 200
    assert resp.data["cin"] == "99887766"  # RH+ voit le CIN en clair


def test_cin_en_clair_pour_le_proprietaire_de_la_fiche(api_client, membre_user):
    ma_fiche = MembreFactory(user=membre_user, cin="55667788")
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-detail", args=[ma_fiche.id]))
    assert resp.status_code == 200
    assert resp.data["cin"] == "55667788"


def test_cin_masque_dans_le_listing(api_client, rh_user):
    MembreFactory(cin="12345678")
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"))
    assert resp.status_code == 200
    assert "cin" not in resp.data["results"][0]
    assert resp.data["results"][0]["cin_masque"] == "•••••678"


# --- Création / modification (RH+) ---


def test_create_comme_membre_refuse_403(api_client, membre_user):
    _auth(api_client, membre_user)
    resp = api_client.post(reverse("membres:membre-list"), _payload(), format="json")
    assert resp.status_code == 403


def test_create_comme_rh_ok(api_client, rh_user):
    _auth(api_client, rh_user)
    resp = api_client.post(reverse("membres:membre-list"), _payload(), format="json")
    assert resp.status_code == 201
    assert resp.data["numero_membre"].startswith("CA-")


def test_create_user_deja_lie_refuse_400(api_client, rh_user, membre_user):
    MembreFactory(user=membre_user)
    _auth(api_client, rh_user)
    resp = api_client.post(
        reverse("membres:membre-list"), _payload(user=str(membre_user.id)), format="json"
    )
    assert resp.status_code == 400


def test_create_sans_adresse_allemande_refuse_si_pays_allemagne(api_client, rh_user):
    _auth(api_client, rh_user)
    payload = _payload(email="autre@example.de", cin="99999999")
    del payload["adresse_de"]
    del payload["ville_de"]
    resp = api_client.post(reverse("membres:membre-list"), payload, format="json")
    assert resp.status_code == 400
    assert "adresse_de" in resp.data["details"]
    assert "ville_de" in resp.data["details"]


def test_create_membre_residant_a_letranger_sans_adresse_allemande_ok(api_client, rh_user):
    _auth(api_client, rh_user)
    resp = api_client.post(
        reverse("membres:membre-list"),
        {
            "prenom": "Sana",
            "nom": "Werfelli",
            "date_naissance": "1992-04-01",
            "email": "sana.werfelli@example.fr",
            "telephone": "+33 6 12 34 56 78",
            "cin": "55667788",
            "pays": "FR",
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["pays"] == "FR"
    assert resp.data["adresse_de"] == ""
    assert resp.data["ville_de"] == ""


def test_update_comme_rh_ok(api_client, rh_user):
    membre = MembreFactory(ville_de="Hambourg")
    _auth(api_client, rh_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[membre.id]), {"ville_de": "Munich"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["ville_de"] == "Munich"


# --- Suppression (Bureau Admin+) ---


def test_destroy_comme_rh_refuse_403(api_client, rh_user):
    membre = MembreFactory()
    _auth(api_client, rh_user)
    resp = api_client.delete(reverse("membres:membre-detail", args=[membre.id]))
    assert resp.status_code == 403


def test_destroy_comme_bureau_admin_ok(api_client, bureau_admin_user):
    membre = MembreFactory()
    _auth(api_client, bureau_admin_user)
    resp = api_client.delete(reverse("membres:membre-detail", args=[membre.id]))
    assert resp.status_code == 204


# --- Action changer_statut (RH+) ---


def test_changer_statut_comme_rh_ok(api_client, rh_user):
    membre = MembreFactory(statut=StatutMembre.EN_ATTENTE)
    _auth(api_client, rh_user)
    resp = api_client.post(
        reverse("membres:membre-changer-statut", args=[membre.id]),
        {"statut": "actif"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == "actif"


def test_changer_statut_comme_membre_refuse_403(api_client, membre_user):
    ma_fiche = MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.post(
        reverse("membres:membre-changer-statut", args=[ma_fiche.id]),
        {"statut": "actif"},
        format="json",
    )
    assert resp.status_code == 403


def test_changer_statut_valeur_invalide_400(api_client, rh_user):
    membre = MembreFactory()
    _auth(api_client, rh_user)
    resp = api_client.post(
        reverse("membres:membre-changer-statut", args=[membre.id]),
        {"statut": "pas_un_statut"},
        format="json",
    )
    assert resp.status_code == 400
    assert resp.data["code"] == "statut_invalide"


# --- Filtres (TDD §2.3) ---


def test_filtre_par_statut(api_client, rh_user):
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.INACTIF)
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"), {"statut": "inactif"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["statut"] == "inactif"


def test_filtre_par_ville(api_client, rh_user):
    MembreFactory(ville_de="Berlin")
    MembreFactory(ville_de="Munich")
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"), {"ville": "berlin"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_filtre_par_nom(api_client, rh_user):
    MembreFactory(nom="Zribi")
    MembreFactory(nom="Bchini")
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"), {"nom": "zribi"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["nom"] == "Zribi"


def test_recherche_libre_q(api_client, rh_user):
    MembreFactory(nom="Zribi", prenom="Ahmed")
    MembreFactory(nom="Bchini", prenom="Riadh")
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-list"), {"q": "riadh"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["prenom"] == "Riadh"


def test_date_naissance_requise_a_la_creation(api_client, rh_user):
    _auth(api_client, rh_user)
    payload = _payload()
    del payload["date_naissance"]
    resp = api_client.post(reverse("membres:membre-list"), payload, format="json")
    assert resp.status_code == 400

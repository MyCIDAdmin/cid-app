"""
Tests API — app membres (TDD §2.4, SCD §2.3 A01 : "test obligatoire en
CI/CD : cas de test DRF vérifiant qu'un membre A ne peut pas lire les
données de membre B").
"""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
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


def _image_valide(nom="profil.jpg", format_pillow="JPEG", content_type="image/jpeg"):
    # Même helper que apps.evenements.tests.test_api._image_valide — un JPEG/PNG minimal
    # réellement décodable par Pillow, requis par valider_et_reencoder_photo (voir
    # apps.communaute.validators) qu'MembreSerializer.validate_photo appelle aussi.
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color=(0, 0, 255)).save(buffer, format=format_pillow)
    buffer.seek(0)
    return SimpleUploadedFile(nom, buffer.read(), content_type=content_type)


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


# Retour utilisateur du 2026-09-28 (point 5, même règle qu'à l'inscription libre-service — voir
# apps.accounts.tests.test_api.test_register_sans_cin_ni_passeport_echoue) : cette fiche partage
# le même modèle Membre, la contrainte "au moins CIN ou passeport" s'applique donc ici aussi.
def test_create_sans_cin_ni_passeport_refuse(api_client, rh_user):
    _auth(api_client, rh_user)
    payload = _payload()
    del payload["cin"]
    resp = api_client.post(reverse("membres:membre-list"), payload, format="json")
    assert resp.status_code == 400
    assert "cin" in resp.data["details"]


def test_create_avec_uniquement_passeport_ok(api_client, rh_user):
    _auth(api_client, rh_user)
    payload = _payload()
    del payload["cin"]
    payload["passeport"] = "P1234567"
    resp = api_client.post(reverse("membres:membre-list"), payload, format="json")
    assert resp.status_code == 201, resp.data


def test_update_comme_rh_ok(api_client, rh_user):
    membre = MembreFactory(ville_de="Hambourg")
    _auth(api_client, rh_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[membre.id]), {"ville_de": "Munich"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["ville_de"] == "Munich"


def test_update_comme_rh_peut_changer_champs_administratifs(api_client, rh_user):
    membre = MembreFactory(statut=StatutMembre.EN_ATTENTE)
    _auth(api_client, rh_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[membre.id]),
        {"statut": StatutMembre.ACTIF, "date_adhesion": "2024-01-15"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutMembre.ACTIF
    assert resp.data["date_adhesion"] == "2024-01-15"


# --- Modification par le Membre de sa propre fiche (AHM-51) ---


def test_update_comme_membre_sa_propre_fiche_ok(api_client, membre_user):
    ma_fiche = MembreFactory(user=membre_user, telephone="+49 30 0000000")
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[ma_fiche.id]),
        {"telephone": "+49 30 1111111", "ville_de": "Leipzig"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["telephone"] == "+49 30 1111111"
    assert resp.data["ville_de"] == "Leipzig"


def test_update_comme_membre_fiche_d_un_autre_refuse(api_client, membre_user):
    autre = MembreFactory()
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[autre.id]), {"telephone": "+49 1"}, format="json"
    )
    assert resp.status_code == 404


def test_update_comme_membre_champs_administratifs_ignores(api_client, membre_user, rh_user):
    ma_fiche = MembreFactory(user=membre_user, statut=StatutMembre.EN_ATTENTE)
    ancien_statut = ma_fiche.statut
    ancienne_date_adhesion = ma_fiche.date_adhesion
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-detail", args=[ma_fiche.id]),
        {
            "statut": StatutMembre.ACTIF,
            "date_adhesion": "2020-01-01",
            "user": str(rh_user.id),
            "telephone": "+49 89 9999999",
        },
        format="json",
    )
    assert resp.status_code == 200
    # Les champs administratifs sont silencieusement ignorés (read_only côté
    # serializer pour ce rôle) — seul le champ personnel est appliqué.
    assert resp.data["telephone"] == "+49 89 9999999"
    ma_fiche.refresh_from_db()
    assert ma_fiche.statut == ancien_statut
    assert ma_fiche.date_adhesion == ancienne_date_adhesion
    assert ma_fiche.user_id == membre_user.id


def test_changer_statut_reste_le_seul_moyen_meme_pour_sa_propre_fiche(api_client, membre_user):
    """L'action dédiée changer_statut (RH+) reste le seul chemin pour changer
    un statut — un Membre ne doit jamais pouvoir l'atteindre, même sur sa
    propre fiche (cf test_changer_statut_comme_membre_refuse_403 déjà
    existant, reformulé ici pour documenter le lien avec AHM-51)."""
    ma_fiche = MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.post(
        reverse("membres:membre-changer-statut", args=[ma_fiche.id]),
        {"statut": StatutMembre.ACTIF},
        format="json",
    )
    assert resp.status_code == 403


# --- Action "moi" (bouton "Mein Profil" du menu utilisateur, ajouté le 2026-09-28) ---


def test_moi_comme_membre_retourne_sa_propre_fiche(api_client, membre_user):
    ma_fiche = MembreFactory(user=membre_user, ville_de="Cologne")
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-moi"))
    assert resp.status_code == 200
    assert resp.data["id"] == str(ma_fiche.id)
    assert resp.data["ville_de"] == "Cologne"


def test_moi_sans_fiche_liee_404(api_client, rh_user):
    # Un compte RH créé hors auto-inscription peut n'avoir aucune fiche Membre liée.
    _auth(api_client, rh_user)
    resp = api_client.get(reverse("membres:membre-moi"))
    assert resp.status_code == 404
    assert resp.data["code"] == "aucune_fiche_membre"


def test_moi_patch_met_a_jour_sa_propre_fiche(api_client, membre_user):
    MembreFactory(user=membre_user, telephone="+49 30 0000000")
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-moi"),
        {"telephone": "+49 30 2222222", "ville_de": "Dresde"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["telephone"] == "+49 30 2222222"
    assert resp.data["ville_de"] == "Dresde"


def test_moi_patch_ignore_les_champs_administratifs(api_client, membre_user, rh_user):
    ma_fiche = MembreFactory(user=membre_user, statut=StatutMembre.EN_ATTENTE)
    ancien_statut = ma_fiche.statut
    ancienne_date_adhesion = ma_fiche.date_adhesion
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-moi"),
        {
            "statut": StatutMembre.ACTIF,
            "date_adhesion": "2020-01-01",
            "user": str(rh_user.id),
            "telephone": "+49 89 1231231",
        },
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["telephone"] == "+49 89 1231231"
    ma_fiche.refresh_from_db()
    assert ma_fiche.statut == ancien_statut
    assert ma_fiche.date_adhesion == ancienne_date_adhesion
    assert ma_fiche.user_id == membre_user.id


def test_moi_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse("membres:membre-moi"))
    assert resp.status_code == 401


# --- Upload de photo de profil (retour utilisateur du 2026-09-28) ---


def test_upload_photo_valide_est_reencodee(api_client, membre_user):
    MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.patch(
        reverse("membres:membre-moi"),
        {"photo": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 200, resp.data
    assert resp.data["photo"] is not None


def test_upload_photo_invalide_rejette_fichier_non_image(api_client, membre_user):
    MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    faux_fichier = SimpleUploadedFile(
        "malware.jpg", b"pas une vraie image", content_type="image/jpeg"
    )
    resp = api_client.patch(
        reverse("membres:membre-moi"),
        {"photo": faux_fichier},
        format="multipart",
    )
    assert resp.status_code == 400
    assert "photo" in resp.data["details"]


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


# --- apps.rbac Phase B : rôle personnalisé élevé sur le module "membres" (IDOR régression) ---


def test_list_comme_role_personnalise_eleve_retourne_toutes_les_fiches(api_client):
    """Un rôle personnalisé avec au moins la lecture sur "membres" doit voir TOUTES les fiches,
    exactement comme RH/Admin aujourd'hui — voir is_elevated_for_module et le plan approuvé
    ("si j'ai la rôle Mitglieder ET Leseberechtigung sur Mitglieder, je vois seulement mes
    propres données. Mais wenn ich Admin/HR bin, sehe ich alle Daten")."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user = _user(Role.MEMBRE, "vertrieb-idor@example.de")
    role = RoleDefinitionFactory(slug="vertrieb-membres-idor")
    RoleModulePermissionFactory(role=role, module="membres", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role)
    MembreFactory.create_batch(2)  # d'autres fiches, sans lien à `user`
    ma_fiche = MembreFactory(user=user)

    _auth(api_client, user)
    resp = api_client.get(reverse("membres:membre-list"))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 3
    ids = {r["id"] for r in resp.data["results"]}
    assert str(ma_fiche.id) in ids


def test_list_comme_membre_sans_role_eleve_ne_voit_toujours_que_sa_propre_fiche(
    api_client, membre_user
):
    """Régression explicite après le câblage Phase B : un rôle "membre" pur, sans aucune
    UserRoleAssignment supplémentaire, continue de ne voir que sa propre fiche — le
    comportement historique (SCD §2.3 A01) n'a pas bougé."""
    MembreFactory.create_batch(2)
    ma_fiche = MembreFactory(user=membre_user)
    _auth(api_client, membre_user)
    resp = api_client.get(reverse("membres:membre-list"))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["id"] == str(ma_fiche.id)


def test_liste_membres_expose_l_offre_actuelle(api_client, rh_user):
    """Point 7.2 (2026-10-06) : colonne "Angebot" de la liste des membres."""
    from apps.adhesions.models import StatutSouscription
    from apps.adhesions.tests.factories import (
        CampagneAdhesionFactory,
        OffreAdhesionFactory,
        SouscriptionFactory,
    )

    membre = MembreFactory()
    campagne = CampagneAdhesionFactory(annee=2040)
    SouscriptionFactory(
        membre=membre,
        campagne=campagne,
        offre=OffreAdhesionFactory(campagne=campagne, nom="Familie"),
        statut=StatutSouscription.PAYEE,
    )
    api_client.force_authenticate(rh_user)
    resp = api_client.get(reverse("membres:membre-list"))
    ligne = next(m for m in resp.data["results"] if m["id"] == str(membre.id))
    assert ligne["offre_actuelle"] == {"nom": "Familie", "annee": 2040, "statut": "payee"}

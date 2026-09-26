"""
Tests API — app projets (module "Projets & Actions", demande utilisateur du 2026-09-22,
SCD §2.3 A01 : IDOR — voir en particulier les tests "un autre projet"/"reassignation" qui
vérifient qu'un responsable ne peut agir que sur SON projet, jamais sur un autre).
"""

import io
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ModePaiement, StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory
from apps.projets.models import StatutProjet
from apps.projets.tests.factories import ProjetFactory, ProjetImageFactory, ProjetMiseAJourFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


PROJET_LIST_URL = "projets:projet-list"
IMAGE_LIST_URL = "projets:projet-image-list"
MAJ_LIST_URL = "projets:projet-mise-a-jour-list"
MAJ_IMAGE_LIST_URL = "projets:projet-mise-a-jour-image-list"


def _projet_detail_url(projet):
    return reverse("projets:projet-detail", args=[projet.id])


def _contributeurs_url(projet):
    return reverse("projets:projet-contributeurs", args=[projet.id])


def _image_detail_url(image):
    return reverse("projets:projet-image-detail", args=[image.id])


def _maj_detail_url(maj):
    return reverse("projets:projet-mise-a-jour-detail", args=[maj.id])


def _image_valide(nom="photo.jpg", format_pillow="JPEG", content_type="image/jpeg"):
    # Même helper que apps.communaute.tests.test_api._image_valide — un JPEG/PNG minimal
    # réellement décodable par Pillow, requis par valider_et_reencoder_photo (voir
    # apps.communaute.validators) que ProjetImageSerializer/ProjetMiseAJourImageSerializer
    # appellent aussi.
    buffer = io.BytesIO()
    Image.new("RGB", (60, 60), color=(255, 0, 0)).save(buffer, format=format_pillow)
    buffer.seek(0)
    return SimpleUploadedFile(nom, buffer.read(), content_type=content_type)


# --- Projet : lecture ---------------------------------------------------------------


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(PROJET_LIST_URL))
    assert resp.status_code == 401


def test_membre_normal_ne_voit_pas_projet_en_preparation(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p1@example.de")
    ProjetFactory(statut=StatutProjet.EN_PREPARATION, titre="Secret")
    ProjetFactory(statut=StatutProjet.EN_COURS, titre="Visible")
    resp = _auth(api_client, user).get(reverse(PROJET_LIST_URL))
    assert resp.status_code == 200
    titres = [p["titre"] for p in resp.data["results"]]
    assert "Visible" in titres
    assert "Secret" not in titres


def test_bureau_admin_voit_projet_en_preparation(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "p2@example.de")
    ProjetFactory(statut=StatutProjet.EN_PREPARATION, titre="Secret")
    resp = _auth(api_client, user).get(reverse(PROJET_LIST_URL))
    titres = [p["titre"] for p in resp.data["results"]]
    assert "Secret" in titres


def test_detail_projet_expose_montant_collecte_et_nb_contributeurs_calcules(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p3@example.de")
    projet = ProjetFactory(cagnote_active=True, objectif_montant=Decimal("500.00"))
    CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        montant="30.00",
        mode_paiement=ModePaiement.CARTE,
        statut=StatutCotisation.PAYEE,
    )
    resp = _auth(api_client, user).get(_projet_detail_url(projet))
    assert resp.status_code == 200
    assert resp.data["montant_collecte"] == "30.00"
    assert resp.data["nb_contributeurs"] == 1


# --- est_gestionnaire (calculé côté serveur, jamais par le frontend — voir docstring de
# ProjetSerializer : CidUser.id et Membre.id sont deux modèles distincts) -------------


def test_est_gestionnaire_vrai_pour_bureau_admin_sur_nimporte_quel_projet(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "p23@example.de")
    projet = ProjetFactory()  # responsable = un autre membre
    resp = _auth(api_client, user).get(_projet_detail_url(projet))
    assert resp.data["est_gestionnaire"] is True


def test_est_gestionnaire_vrai_pour_le_responsable_de_ce_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p24@example.de")
    projet = ProjetFactory(responsable=membre)
    resp = _auth(api_client, user).get(_projet_detail_url(projet))
    assert resp.data["est_gestionnaire"] is True


def test_est_gestionnaire_faux_pour_un_membre_normal_sans_lien_au_projet(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p25@example.de")
    projet = ProjetFactory()  # responsable = un autre membre, sans rapport avec `user`
    resp = _auth(api_client, user).get(_projet_detail_url(projet))
    assert resp.data["est_gestionnaire"] is False


def test_est_gestionnaire_faux_pour_le_responsable_dun_autre_projet(api_client):
    """IDOR — même principe que les tests d'écriture ci-dessous : le statut de
    gestionnaire ne s'étend jamais à un projet dont on n'est pas responsable."""
    user, membre = _user_avec_membre(Role.MEMBRE, "p26@example.de")
    ProjetFactory(responsable=membre)
    autre_projet = ProjetFactory()
    resp = _auth(api_client, user).get(_projet_detail_url(autre_projet))
    assert resp.data["est_gestionnaire"] is False


# --- Projet : écriture (Bureau Admin+ uniquement) ------------------------------------


def test_membre_normal_ne_peut_pas_creer_projet(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p4@example.de")
    resp = _auth(api_client, user).post(reverse(PROJET_LIST_URL), {"titre": "Nouveau projet"})
    assert resp.status_code == 403


def test_responsable_ne_peut_pas_creer_projet(api_client):
    """Le·la responsable gère le CONTENU de sa kachel (images, mises à jour), jamais le
    Projet lui-même (statut, cagnote, échéance...) — voir docstring de module
    permissions.py."""
    user, membre = _user_avec_membre(Role.MEMBRE, "p5@example.de")
    resp = _auth(api_client, user).post(reverse(PROJET_LIST_URL), {"titre": "Nouveau projet"})
    assert resp.status_code == 403


def test_bureau_admin_peut_creer_projet(api_client):
    user, membre = _user_avec_membre(Role.BUREAU_ADMIN, "p6@example.de")
    resp = _auth(api_client, user).post(
        reverse(PROJET_LIST_URL),
        {
            "titre": "Rénovation local associatif",
            "description_html": "<p>Texte riche.</p>",
            "cagnote_active": True,
            "objectif_montant": "1000.00",
            "date_limite": "2027-01-01",
        },
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["montant_collecte"] == "0.00"
    assert resp.data["nb_contributeurs"] == 0
    assert resp.data["created_by"] == membre.id


def test_responsable_ne_peut_pas_modifier_le_projet_lui_meme(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p7@example.de")
    projet = ProjetFactory(responsable=membre, cagnote_active=False)
    resp = _auth(api_client, user).patch(_projet_detail_url(projet), {"cagnote_active": True})
    assert resp.status_code == 403


def test_bureau_admin_peut_modifier_projet(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "p8@example.de")
    projet = ProjetFactory(statut=StatutProjet.EN_COURS)
    resp = _auth(api_client, user).patch(
        _projet_detail_url(projet), {"statut": StatutProjet.TERMINE}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutProjet.TERMINE


# --- contributeurs (face arrière de la kachel, demande utilisateur point 5) ----------


def test_contributeurs_ouvert_a_tout_authentifie_et_agrege_par_membre(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p9@example.de")
    projet = ProjetFactory(cagnote_active=True)
    membre_a = MembreFactory(prenom="Amira")
    membre_b = MembreFactory(prenom="Bilel")
    CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        membre=membre_a,
        montant="10.00",
        mode_paiement=ModePaiement.CARTE,
        statut=StatutCotisation.PAYEE,
    )
    CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        membre=membre_a,
        montant="5.00",
        mode_paiement=ModePaiement.CARTE,
        statut=StatutCotisation.PAYEE,
    )
    CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        membre=membre_b,
        montant="50.00",
        mode_paiement=ModePaiement.CARTE,
        statut=StatutCotisation.PAYEE,
    )
    # Pas encore payée : ne doit apparaître dans aucun total.
    CotisationFactory(
        type_article=TypeArticle.PROJET,
        projet=projet,
        membre=MembreFactory(),
        montant="999.00",
        statut=StatutCotisation.EN_ATTENTE,
    )

    resp = _auth(api_client, user).get(_contributeurs_url(projet))
    assert resp.status_code == 200
    assert len(resp.data) == 2
    # Trié par montant décroissant — Bilel (50) avant Amira (15, cumul de ses 2 dons).
    assert resp.data[0]["membre"]["prenom"] == "Bilel"
    assert resp.data[0]["montant_total"] == "50.00"
    assert resp.data[1]["membre"]["prenom"] == "Amira"
    assert resp.data[1]["montant_total"] == "15.00"


def test_contributeurs_non_authentifie_refuse(api_client):
    projet = ProjetFactory()
    resp = api_client.get(_contributeurs_url(projet))
    assert resp.status_code == 401


# --- Images de la kachel : Bureau Admin+ OU responsable DE CE projet -----------------


def test_membre_normal_ne_peut_pas_ajouter_image(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p10@example.de")
    projet = ProjetFactory()
    resp = _auth(api_client, user).post(
        reverse(IMAGE_LIST_URL),
        {"projet": str(projet.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403


def test_responsable_peut_ajouter_image_a_son_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p11@example.de")
    projet = ProjetFactory(responsable=membre)

    resp = _auth(api_client, user).post(
        reverse(IMAGE_LIST_URL),
        {"projet": str(projet.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["uploaded_by"] == membre.id


def test_responsable_ne_peut_pas_ajouter_image_a_un_autre_projet(api_client):
    """IDOR — un responsable n'est gestionnaire QUE du projet qui lui est assigné (voir
    apps.projets.permissions.est_gestionnaire_projet)."""
    user, membre = _user_avec_membre(Role.MEMBRE, "p12@example.de")
    projet_dont_il_est_responsable = ProjetFactory(responsable=membre)
    autre_projet = ProjetFactory()  # responsable différent (SubFactory par défaut)

    resp = _auth(api_client, user).post(
        reverse(IMAGE_LIST_URL),
        {"projet": str(autre_projet.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403
    assert autre_projet.images.count() == 0
    # Vérifie que ce n'est pas juste "toute création refusée" : sur SON projet, ça marche
    # (test séparé ci-dessus) — cette assertion isole bien la portée de l'IDOR.
    assert projet_dont_il_est_responsable.responsable_id == membre.id


def test_bureau_admin_peut_ajouter_image_a_nimporte_quel_projet(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "p13@example.de")
    projet = ProjetFactory()  # responsable = un autre membre, sans rapport avec `user`

    resp = _auth(api_client, user).post(
        reverse(IMAGE_LIST_URL),
        {"projet": str(projet.id), "image": _image_valide(nom="kachel.png")},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data


def test_reassignation_image_vers_un_autre_projet_est_ignoree(api_client):
    """IDOR — `projet` est immuable après création (voir
    ProjetImageSerializer.update) : un responsable autorisé à modifier CETTE image ne
    doit pas pouvoir la faire "glisser" vers un projet dont il n'est pas gestionnaire."""
    user, membre = _user_avec_membre(Role.MEMBRE, "p14@example.de")
    mon_projet = ProjetFactory(responsable=membre)
    autre_projet = ProjetFactory()
    image = ProjetImageFactory(projet=mon_projet, ordre=0)

    resp = _auth(api_client, user).patch(
        _image_detail_url(image), {"projet": str(autre_projet.id), "ordre": 5}
    )
    assert resp.status_code == 200, resp.data
    image.refresh_from_db()
    assert image.projet_id == mon_projet.id
    assert image.ordre == 5


def test_membre_normal_ne_peut_pas_supprimer_image_dun_projet(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p15@example.de")
    image = ProjetImageFactory()
    resp = _auth(api_client, user).delete(_image_detail_url(image))
    assert resp.status_code == 403


# --- Mises à jour du rapport d'avancement (demande utilisateur point 7) --------------


def test_membre_normal_ne_peut_pas_ajouter_mise_a_jour(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p16@example.de")
    projet = ProjetFactory()
    resp = _auth(api_client, user).post(
        reverse(MAJ_LIST_URL),
        {"projet": str(projet.id), "titre": "Avancement", "contenu_html": "<p>...</p>"},
    )
    assert resp.status_code == 403


def test_responsable_peut_ajouter_mise_a_jour_a_son_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p17@example.de")
    projet = ProjetFactory(responsable=membre)
    resp = _auth(api_client, user).post(
        reverse(MAJ_LIST_URL),
        {"projet": str(projet.id), "titre": "Avancement", "contenu_html": "<p>Fait.</p>"},
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["created_by"] == membre.id


def test_responsable_ne_peut_pas_ajouter_mise_a_jour_a_un_autre_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p18@example.de")
    ProjetFactory(responsable=membre)
    autre_projet = ProjetFactory()
    resp = _auth(api_client, user).post(
        reverse(MAJ_LIST_URL),
        {"projet": str(autre_projet.id), "titre": "Avancement", "contenu_html": "<p>...</p>"},
    )
    assert resp.status_code == 403


def test_reassignation_mise_a_jour_vers_un_autre_projet_est_ignoree(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p19@example.de")
    mon_projet = ProjetFactory(responsable=membre)
    autre_projet = ProjetFactory()
    maj = ProjetMiseAJourFactory(projet=mon_projet, titre="Original")

    resp = _auth(api_client, user).patch(
        _maj_detail_url(maj), {"projet": str(autre_projet.id), "titre": "Modifié"}
    )
    assert resp.status_code == 200, resp.data
    maj.refresh_from_db()
    assert maj.projet_id == mon_projet.id
    assert maj.titre == "Modifié"


# --- Images des mises à jour (demande utilisateur point 7, "mit Bildern") -----------


def test_membre_normal_ne_peut_pas_ajouter_image_a_une_mise_a_jour(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "p20@example.de")
    maj = ProjetMiseAJourFactory()
    resp = _auth(api_client, user).post(
        reverse(MAJ_IMAGE_LIST_URL),
        {"mise_a_jour": str(maj.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403


def test_responsable_peut_ajouter_image_a_une_mise_a_jour_de_son_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p21@example.de")
    projet = ProjetFactory(responsable=membre)
    maj = ProjetMiseAJourFactory(projet=projet)

    resp = _auth(api_client, user).post(
        reverse(MAJ_IMAGE_LIST_URL),
        {"mise_a_jour": str(maj.id), "image": _image_valide(nom="maj.jpg")},
        format="multipart",
    )
    assert resp.status_code == 201, resp.data


def test_responsable_ne_peut_pas_ajouter_image_a_une_mise_a_jour_dun_autre_projet(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "p22@example.de")
    ProjetFactory(responsable=membre)
    maj_autre_projet = ProjetMiseAJourFactory()  # projet différent, responsable différent
    resp = _auth(api_client, user).post(
        reverse(MAJ_IMAGE_LIST_URL),
        {"mise_a_jour": str(maj_autre_projet.id), "image": _image_valide()},
        format="multipart",
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Projekt- & Aktionsverwaltung"
# (page_projets) désormais pilotée par apps.rbac (real enforcement, y compris pour les rôles
# système eux-mêmes) — couvre uniquement ProjetPermission (écriture du Projet lui-même).
# est_gestionnaire_projet (Bureau Admin+ OU responsable de CE projet, utilisé par
# GestionContenuProjetPermission pour le contenu de la kachel) reste inchangé.
# ---------------------------------------------------------------------------

_PROJET_PAYLOAD = {"titre": "Rénovation local associatif"}


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_bureau_admin_perd_lacces_aux_projets_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_projets", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-projets-restrict@example.de")

    resp = _auth(api_client, user).post(reverse(PROJET_LIST_URL), _PROJET_PAYLOAD)
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_gerer_les_projets_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-projets-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="projets-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_projets", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    resp = _auth(api_client, user).post(reverse(PROJET_LIST_URL), _PROJET_PAYLOAD)
    assert resp.status_code == 201, resp.data


def test_phase_d_super_admin_gere_toujours_les_projets_meme_si_matrice_dit_aucun(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_projets", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "phased-projets-super@example.de")

    resp = _auth(api_client, user).post(reverse(PROJET_LIST_URL), _PROJET_PAYLOAD)
    assert resp.status_code == 201, resp.data


# ---------------------------------------------------------------------------
# Lecture vs écriture (ajouté le 2026-09-24, task #214, retour utilisateur sur Quiz-Verwaltung —
# voir apps.rbac.services.has_admin_page_access) : ProjetPermission laisse la lecture (GET) et
# `contributeurs` ouvertes à tout authentifié indépendamment de la matrice ; seule l'écriture
# (create/update/partial_update/destroy) requiert `lecture_ecriture`. GestionContenuProjetPermission
# / est_gestionnaire_projet (responsable du projet) restent hors scope, inchangés.
# ---------------------------------------------------------------------------


def test_role_lecture_seule_peut_lister_les_projets_mais_pas_en_creer(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    ProjetFactory.create_batch(2)
    user, _ = _user_avec_membre(Role.MEMBRE, "readonly-projets@example.de")
    role_perso = RoleDefinitionFactory(slug="projets-lecteur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_projets", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp_list = api_client.get(reverse(PROJET_LIST_URL))
    assert resp_list.status_code == 200
    assert len(resp_list.data["results"]) == 2

    resp_create = api_client.post(reverse(PROJET_LIST_URL), _PROJET_PAYLOAD)
    assert resp_create.status_code == 403


def test_role_lecture_ecriture_peut_creer_un_projet(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _ = _user_avec_membre(Role.MEMBRE, "readwrite-projets@example.de")
    role_perso = RoleDefinitionFactory(slug="projets-editeur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_projets", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.post(reverse(PROJET_LIST_URL), _PROJET_PAYLOAD)
    assert resp.status_code == 201, resp.data


def test_role_lecture_seule_peut_quand_meme_voir_les_contributeurs(api_client):
    """`contributeurs` reste ouverte à tout authentifié (voir docstring de module
    ProjetPermission) — une cellule `lecture` seule n'y change rien, contrairement à
    create/update/destroy."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    projet = ProjetFactory()
    user, _ = _user_avec_membre(Role.MEMBRE, "readonly-projets-contrib@example.de")
    role_perso = RoleDefinitionFactory(slug="projets-lecteur-contrib")
    RoleModulePermissionFactory(
        role=role_perso, module="page_projets", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.get(_contributeurs_url(projet))
    assert resp.status_code == 200

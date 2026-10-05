"""Tests API — app rbac (SCD §2.3 A01 : IDOR / contrôle d'accès). Voir views.py pour le détail
des endpoints — tout est réservé à IsSuperAdmin sauf visibilite-membre/effective/."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.rbac.models import (
    ModuleVisibiliteMembre,
    NiveauAcces,
    RoleDefinition,
    RoleModulePermission,
    UserRoleAssignment,
)
from apps.rbac.registry import (
    ALL_MODULES,
    MODULES,
    PAGES_ADMIN,
    VISIBILITE_KEYS,
    VISIBILITE_NON_MEMBRE_DEFAUT,
)
from apps.rbac.tests.factories import (
    RoleDefinitionFactory,
    RoleModulePermissionFactory,
    UserFactory,
    UserRoleAssignmentFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _super_admin():
    return UserFactory(role=Role.SUPER_ADMIN)


ROLES_URL = "rbac:role-list"


def _role_detail_url(role):
    return reverse("rbac:role-detail", args=[role.id])


MODULES_URL = "rbac:modules-list"
MATRIX_URL = "rbac:matrix"
MATRIX_SET_URL = "rbac:matrix-set"
VISIBILITE_URL = "rbac:visibilite-membre"
VISIBILITE_SET_URL = "rbac:visibilite-membre-set"
VISIBILITE_EFFECTIVE_URL = "rbac:visibilite-membre-effective"


def _user_roles_url(user):
    return reverse("rbac:user-roles", args=[user.id])


# --- accès / permissions ----------------------------------------------------------------------


def test_roles_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(ROLES_URL))
    assert resp.status_code == 401


def test_roles_list_membre_normal_refuse(api_client):
    membre = UserFactory(role=Role.MEMBRE)
    resp = _auth(api_client, membre).get(reverse(ROLES_URL))
    assert resp.status_code == 403


def test_visibilite_effective_accessible_a_tout_utilisateur_connecte(api_client):
    membre = UserFactory(role=Role.MEMBRE)
    resp = _auth(api_client, membre).get(reverse(VISIBILITE_EFFECTIVE_URL))
    assert resp.status_code == 200
    assert set(resp.data.keys()) == set(VISIBILITE_KEYS)


# --- CRUD rôles --------------------------------------------------------------------------------


def test_roles_list_super_admin_voit_les_5_roles_systeme(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).get(reverse(ROLES_URL))
    assert resp.status_code == 200
    resultats = resp.data["results"]
    slugs = {r["slug"] for r in resultats}
    assert slugs == {"membre", "rh", "bureau_admin", "dir_financier", "super_admin"}
    assert all(r["is_system"] for r in resultats)


def test_creation_role_personnalise(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).post(
        reverse(ROLES_URL), {"slug": "vertrieb", "nom": "Vertrieb", "ordre": 6}
    )
    assert resp.status_code == 201
    assert resp.data["is_system"] is False
    assert RoleDefinition.objects.filter(slug="vertrieb", is_system=False).exists()


def test_creation_role_ignore_is_system_envoye_par_le_client(api_client):
    """`is_system` est en lecture seule — un rôle créé via l'API est TOUJOURS is_system=False,
    même si le payload tente d'en dire autrement."""
    admin = _super_admin()
    resp = _auth(api_client, admin).post(
        reverse(ROLES_URL), {"slug": "design", "nom": "Design", "is_system": True}
    )
    assert resp.status_code == 201
    assert resp.data["is_system"] is False


def test_modification_role_systeme_refuse(api_client):
    admin = _super_admin()
    role_membre = RoleDefinition.objects.get(slug="membre")
    resp = _auth(api_client, admin).patch(_role_detail_url(role_membre), {"nom": "Autre nom"})
    assert resp.status_code == 403
    role_membre.refresh_from_db()
    assert role_membre.nom != "Autre nom"


def test_suppression_role_systeme_refuse(api_client):
    admin = _super_admin()
    role_membre = RoleDefinition.objects.get(slug="membre")
    resp = _auth(api_client, admin).delete(_role_detail_url(role_membre))
    assert resp.status_code == 403
    assert RoleDefinition.objects.filter(slug="membre").exists()


def test_suppression_role_personnalise_encore_attribue_409(api_client):
    admin = _super_admin()
    role = RoleDefinitionFactory(slug="finance-projet")
    UserRoleAssignmentFactory(role=role)

    resp = _auth(api_client, admin).delete(_role_detail_url(role))
    assert resp.status_code == 409
    assert RoleDefinition.objects.filter(id=role.id).exists()


def test_suppression_role_personnalise_non_attribue_reussit(api_client):
    admin = _super_admin()
    role = RoleDefinitionFactory(slug="temporaire")

    resp = _auth(api_client, admin).delete(_role_detail_url(role))
    assert resp.status_code == 204
    assert not RoleDefinition.objects.filter(id=role.id).exists()


def test_modification_role_personnalise_reussit_et_journalise(api_client):
    admin = _super_admin()
    role = RoleDefinitionFactory(slug="a-modifier", nom="Ancien nom")

    resp = _auth(api_client, admin).patch(_role_detail_url(role), {"nom": "Nouveau nom"})
    assert resp.status_code == 200
    role.refresh_from_db()
    assert role.nom == "Nouveau nom"
    assert AuditLogEntry.objects.filter(action="rbac_role_updated").exists()


# --- modules / matrice ---------------------------------------------------------------------


def test_modules_list_reflete_le_registre(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).get(reverse(MODULES_URL))
    assert resp.status_code == 200
    assert [m["slug"] for m in resp.data] == MODULES


def test_matrix_get_auto_complete_les_cellules_manquantes(api_client):
    """Un rôle personnalisé fraîchement créé n'a AUCUNE RoleModulePermission en base — la vue
    doit tout de même renvoyer une cellule "aucun" pour chaque module (auto-extension, exigence
    "la table doit s'étendre automatiquement"). Depuis la Phase D (2026-09-23), la matrice
    inclut aussi les 13 pages de gestion (registry.PAGES_ADMIN) — mêmes colonnes, une seule
    matrice, voir ALL_MODULES."""
    admin = _super_admin()
    role = RoleDefinitionFactory(slug="sans-matrice")

    resp = _auth(api_client, admin).get(reverse(MATRIX_URL))
    assert resp.status_code == 200
    assert [m["slug"] for m in resp.data["modules"]] == ALL_MODULES

    cellules_du_role = [c for c in resp.data["cells"] if str(c["role_id"]) == str(role.id)]
    assert len(cellules_du_role) == len(ALL_MODULES)
    assert all(c["niveau_acces"] == NiveauAcces.AUCUN for c in cellules_du_role)


def test_matrix_get_expose_la_categorie_par_module(api_client):
    """Phase D (2026-09-23) : le frontend a besoin de savoir quelles colonnes verrouiller pour
    l'Administrateur App sans recopier PAGES_ADMIN côté TypeScript."""
    admin = _super_admin()
    resp = _auth(api_client, admin).get(reverse(MATRIX_URL))
    assert resp.status_code == 200
    categories = {m["slug"]: m["categorie"] for m in resp.data["modules"]}
    for slug in MODULES:
        assert categories[slug] == "donnees"
    for slug in PAGES_ADMIN:
        assert categories[slug] == "page_admin"


def test_matrix_set_ecrit_une_cellule_et_journalise(api_client):
    admin = _super_admin()
    role = RoleDefinitionFactory(slug="a-configurer")

    resp = _auth(api_client, admin).post(
        reverse(MATRIX_SET_URL),
        {
            "role_id": str(role.id),
            "module": "membres",
            "niveau_acces": NiveauAcces.LECTURE_ECRITURE,
        },
    )
    assert resp.status_code == 200
    assert RoleModulePermission.objects.get(role=role, module="membres").niveau_acces == (
        NiveauAcces.LECTURE_ECRITURE
    )
    assert AuditLogEntry.objects.filter(action="rbac_matrix_cell_set").exists()


def test_matrix_set_module_inconnu_refuse(api_client):
    admin = _super_admin()
    role = RoleDefinitionFactory()

    resp = _auth(api_client, admin).post(
        reverse(MATRIX_SET_URL),
        {
            "role_id": str(role.id),
            "module": "module-inexistant",
            "niveau_acces": NiveauAcces.LECTURE,
        },
    )
    assert resp.status_code == 400


def test_matrix_set_remplace_une_cellule_existante(api_client):
    admin = _super_admin()
    permission = RoleModulePermissionFactory(module="membres", niveau_acces=NiveauAcces.LECTURE)

    resp = _auth(api_client, admin).post(
        reverse(MATRIX_SET_URL),
        {
            "role_id": str(permission.role_id),
            "module": "membres",
            "niveau_acces": NiveauAcces.LECTURE_ECRITURE,
        },
    )
    assert resp.status_code == 200
    assert RoleModulePermission.objects.filter(role=permission.role, module="membres").count() == 1
    permission.refresh_from_db()
    assert permission.niveau_acces == NiveauAcces.LECTURE_ECRITURE


# --- visibilité membre ----------------------------------------------------------------------


def test_visibilite_membre_get_defaut_tout_visible(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).get(reverse(VISIBILITE_URL))
    assert resp.status_code == 200
    assert all(ligne["visible"] is True for ligne in resp.data)
    assert {ligne["module"] for ligne in resp.data} == set(VISIBILITE_KEYS)
    # Point 9 (2026-10-05) : colonne non-membre initialisée aux 5 modules par défaut.
    assert {ligne["module"] for ligne in resp.data if ligne["visible_non_membre"]} == (
        VISIBILITE_NON_MEMBRE_DEFAUT
    )


def test_visibilite_membre_set_masque_un_module(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).post(
        reverse(VISIBILITE_SET_URL), {"module": "vote", "visible": False}
    )
    assert resp.status_code == 200
    assert ModuleVisibiliteMembre.objects.get(module="vote").visible is False
    assert AuditLogEntry.objects.filter(action="rbac_module_visibilite_set").exists()


def test_visibilite_membre_effective_reflete_le_masquage(api_client):
    # La migration de données 0002 a déjà seedé une ligne "vote" (visible=True) — on la bascule
    # explicitement plutôt que via la factory (dont le `django_get_or_create` ne réécrirait pas
    # `visible` sur une ligne déjà existante).
    ModuleVisibiliteMembre.objects.update_or_create(module="vote", defaults={"visible": False})
    membre = UserFactory(role=Role.MEMBRE)
    MembreFactory(user=membre, statut=StatutMembre.ACTIF)

    resp = _auth(api_client, membre).get(reverse(VISIBILITE_EFFECTIVE_URL))
    assert resp.status_code == 200
    assert resp.data["vote"] is False
    assert resp.data["membres"] is True


def test_visibilite_effective_non_membre_utilise_la_colonne_non_membre(api_client):
    """Point 3/9 (2026-10-05) : compte connecté sans adhésion active -> 5 modules par défaut."""
    user = UserFactory(role=Role.MEMBRE)
    MembreFactory(user=user, statut=StatutMembre.EN_ATTENTE)
    resp = _auth(api_client, user).get(reverse(VISIBILITE_EFFECTIVE_URL))
    assert {cle for cle, visible in resp.data.items() if visible} == VISIBILITE_NON_MEMBRE_DEFAUT


def test_visibilite_set_colonne_non_membre(api_client):
    admin = _super_admin()
    resp = _auth(api_client, admin).post(
        reverse(VISIBILITE_SET_URL),
        {"module": "vote", "visible": True, "groupe": "non_membre"},
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data["visible_non_membre"] is True
    user = UserFactory(role=Role.MEMBRE)
    resp = _auth(APIClient(), user).get(reverse(VISIBILITE_EFFECTIVE_URL))
    assert resp.data["vote"] is True


# --- attribution de rôles (mehrfachrollen) ---------------------------------------------------


def test_user_roles_get_retourne_roles_et_role_primaire(api_client):
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)

    resp = _auth(api_client, admin).get(_user_roles_url(cible))
    assert resp.status_code == 200
    assert resp.data["role_primaire"] == Role.MEMBRE
    assert resp.data["role_ids"] == []


def test_user_roles_post_attribue_plusieurs_roles(api_client):
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)
    role_vertrieb = RoleDefinitionFactory(slug="vertrieb-multi")
    role_design = RoleDefinitionFactory(slug="design-multi")

    resp = _auth(api_client, admin).post(
        _user_roles_url(cible),
        {"role_ids": [str(role_vertrieb.id), str(role_design.id)]},
    )
    assert resp.status_code == 200
    ids_attribues = set(
        UserRoleAssignment.objects.filter(user=cible).values_list("role_id", flat=True)
    )
    assert role_vertrieb.id in ids_attribues
    assert role_design.id in ids_attribues


def test_user_roles_post_force_toujours_le_plancher_membre(api_client):
    """ "Ein neuer Benutzer erhält [...] die Rolle Normales Mitglieder" — et cette rôle ne doit
    jamais pouvoir être retirée via cette API, même en l'omettant explicitement du payload."""
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)
    role_vertrieb = RoleDefinitionFactory(slug="vertrieb-floor")
    role_membre = RoleDefinition.objects.get(slug="membre")

    resp = _auth(api_client, admin).post(
        _user_roles_url(cible), {"role_ids": [str(role_vertrieb.id)]}
    )
    assert resp.status_code == 200
    assert str(role_membre.id) in [str(i) for i in resp.data["role_ids"]]
    assert UserRoleAssignment.objects.filter(user=cible, role=role_membre).exists()


def test_user_roles_post_refuse_lauto_modification(api_client):
    admin = _super_admin()
    autre_role = RoleDefinitionFactory()

    resp = _auth(api_client, admin).post(_user_roles_url(admin), {"role_ids": [str(autre_role.id)]})
    assert resp.status_code == 400
    assert not UserRoleAssignment.objects.filter(user=admin, role=autre_role).exists()


def test_user_roles_post_recalcule_le_role_primaire_legacy(api_client):
    """Le champ `user.role` legacy doit rester synchronisé avec le rôle système du plus haut
    niveau parmi les rôles attribués — c'est lui qui pilote encore le 2FA obligatoire etc."""
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)
    role_rh = RoleDefinition.objects.get(slug="rh")

    resp = _auth(api_client, admin).post(_user_roles_url(cible), {"role_ids": [str(role_rh.id)]})
    assert resp.status_code == 200
    cible.refresh_from_db()
    assert cible.role == Role.RH
    assert resp.data["role_primaire"] == Role.RH
    assert AuditLogEntry.objects.filter(action="role_changed", user=cible).exists()
    assert AuditLogEntry.objects.filter(action="rbac_roles_changed", user=cible).exists()


def test_user_roles_post_role_primaire_redescend_a_membre_si_role_eleve_retire(api_client):
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)
    role_rh = RoleDefinition.objects.get(slug="rh")
    role_membre = RoleDefinition.objects.get(slug="membre")

    _auth(api_client, admin).post(_user_roles_url(cible), {"role_ids": [str(role_rh.id)]})
    cible.refresh_from_db()
    assert cible.role == Role.RH

    resp = _auth(api_client, admin).post(
        _user_roles_url(cible), {"role_ids": [str(role_membre.id)]}
    )
    assert resp.status_code == 200
    cible.refresh_from_db()
    assert cible.role == Role.MEMBRE


def test_user_roles_post_role_ids_inexistant_refuse(api_client):
    admin = _super_admin()
    cible = UserFactory(role=Role.MEMBRE)

    resp = _auth(api_client, admin).post(
        _user_roles_url(cible), {"role_ids": ["00000000-0000-0000-0000-000000000000"]}
    )
    assert resp.status_code == 400


# --- Phase D (ajoutée le 2026-09-23) — pages de gestion --------------------------------------

MES_ACCES_URL = "rbac:mes-acces"


def test_mes_acces_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(MES_ACCES_URL))
    assert resp.status_code == 401


def test_mes_acces_super_admin_toujours_lecture_ecriture(api_client):
    """Depuis le 2026-09-24 (task #215), la réponse expose le niveau réel, plus un booléen —
    l'Administrateur App reste hartcodé, donc toujours `lecture_ecriture` sur les 13 pages,
    quel que soit le contenu de la matrice (voir get_admin_page_niveau)."""
    admin = _super_admin()
    resp = _auth(api_client, admin).get(reverse(MES_ACCES_URL))
    assert resp.status_code == 200
    assert set(resp.data.keys()) == set(PAGES_ADMIN)
    assert all(niveau == "lecture_ecriture" for niveau in resp.data.values())


def test_mes_acces_reflete_la_matrice_seedee_pour_un_role_systeme(api_client):
    """Intégration avec la migration de données 0003 : Bureau Admin a lecture_ecriture sur
    page_quiz (seedé, miroir de MODERATION_MIN_LEVEL) mais aucun accès sur page_articles_cotisation
    (seedé Super Admin uniquement, miroir de GESTION_ARTICLES_MIN_LEVEL) — l'endpoint doit
    refléter exactement ce que la migration a écrit, sans changement de comportement au rollout."""
    bureau_admin = UserFactory(role=Role.BUREAU_ADMIN)
    resp = _auth(api_client, bureau_admin).get(reverse(MES_ACCES_URL))
    assert resp.status_code == 200
    assert resp.data["page_quiz"] == "lecture_ecriture"
    assert resp.data["page_articles_cotisation"] == "aucun"


def test_mes_acces_membre_normal_naccede_a_aucune_page_par_defaut(api_client):
    membre = UserFactory(role=Role.MEMBRE)
    resp = _auth(api_client, membre).get(reverse(MES_ACCES_URL))
    assert resp.status_code == 200
    assert all(niveau == "aucun" for niveau in resp.data.values())


def test_mes_acces_distingue_lecture_et_lecture_ecriture(api_client):
    """Le coeur du changement de contrat (task #215) : une cellule `lecture` seule ne doit plus
    se confondre avec `lecture_ecriture` dans la réponse — c'est ce qui permet au frontend de
    désactiver uniquement les contrôles d'écriture d'une page en lecture seule."""
    from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug="dir_financier", is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module="page_quiz", defaults={"niveau_acces": NiveauAcces.LECTURE}
    )
    dir_financier = UserFactory(role=Role.DIR_FINANCIER)
    resp = _auth(api_client, dir_financier).get(reverse(MES_ACCES_URL))
    assert resp.status_code == 200
    assert resp.data["page_quiz"] == "lecture"


def test_matrix_set_refuse_de_modifier_une_cellule_super_admin_sur_une_page_admin(api_client):
    """Garde de la Phase D : l'Administrateur App conserve toujours un accès total et hartcodé
    aux 13 pages de gestion — refusé en 400 plutôt que silencieusement ignoré."""
    admin = _super_admin()
    role_super_admin = RoleDefinition.objects.get(slug="super_admin")

    resp = _auth(api_client, admin).post(
        reverse(MATRIX_SET_URL),
        {
            "role_id": str(role_super_admin.id),
            "module": "page_quiz",
            "niveau_acces": NiveauAcces.AUCUN,
        },
    )
    assert resp.status_code == 400
    assert RoleModulePermission.objects.get(
        role=role_super_admin, module="page_quiz"
    ).niveau_acces == (NiveauAcces.LECTURE_ECRITURE)


def test_matrix_set_autorise_de_modifier_une_cellule_bureau_admin_sur_une_page_admin(api_client):
    """Contrepartie du test précédent : un rôle système AUTRE que super_admin reste bien
    modifiable sur une page de gestion — c'est tout le sens de la Phase D."""
    admin = _super_admin()
    role_bureau_admin = RoleDefinition.objects.get(slug="bureau_admin")

    resp = _auth(api_client, admin).post(
        reverse(MATRIX_SET_URL),
        {
            "role_id": str(role_bureau_admin.id),
            "module": "page_quiz",
            "niveau_acces": NiveauAcces.AUCUN,
        },
    )
    assert resp.status_code == 200
    assert RoleModulePermission.objects.get(
        role=role_bureau_admin, module="page_quiz"
    ).niveau_acces == (NiveauAcces.AUCUN)

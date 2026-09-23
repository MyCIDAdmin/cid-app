"""Tests services — app rbac : get_user_role_slugs, user_has_module_access (union multi-rôle),
is_elevated_for_module."""

import pytest
from django.contrib.auth.models import AnonymousUser

from apps.accounts.models import Role

from apps.rbac.models import NiveauAcces
from apps.rbac.services import get_user_role_slugs, is_elevated_for_module, user_has_module_access
from apps.rbac.tests.factories import RoleDefinitionFactory, RoleModulePermissionFactory, UserFactory, UserRoleAssignmentFactory

pytestmark = pytest.mark.django_db


# --- get_user_role_slugs ---------------------------------------------------------------------


def test_get_user_role_slugs_anonyme_retourne_ensemble_vide():
    assert get_user_role_slugs(AnonymousUser()) == set()


def test_get_user_role_slugs_inclut_toujours_le_role_legacy():
    """Un compte jamais passé par la nouvelle UI (aucune UserRoleAssignment) continue de se
    comporter exactement comme avant ce module — le CharField `user.role` seul suffit."""
    user = UserFactory(role=Role.MEMBRE)
    assert get_user_role_slugs(user) == {"membre"}


def test_get_user_role_slugs_cumule_role_legacy_et_attributions():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="vertrieb")
    UserRoleAssignmentFactory(user=user, role=role_perso)
    assert get_user_role_slugs(user) == {"membre", "vertrieb"}


def test_get_user_role_slugs_ignore_les_roles_inactifs():
    user = UserFactory(role=Role.MEMBRE)
    role_inactif = RoleDefinitionFactory(slug="design", actif=False)
    UserRoleAssignmentFactory(user=user, role=role_inactif)
    assert get_user_role_slugs(user) == {"membre"}


# --- user_has_module_access -----------------------------------------------------------------


def test_user_has_module_access_sans_aucun_role_refuse():
    """Ne peut arriver qu'en théorie (le CharField legacy est toujours présent en pratique) —
    couvre néanmoins le chemin moindre-privilège explicite de la fonction."""
    assert user_has_module_access(AnonymousUser(), "membres", NiveauAcces.LECTURE) is False


def test_user_has_module_access_role_sans_ligne_matrice_vaut_aucun():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="design-sans-matrice")
    UserRoleAssignmentFactory(user=user, role=role_perso)
    # Aucune RoleModulePermission pour "design-sans-matrice" sur "stats" => défaut "aucun".
    assert user_has_module_access(user, "stats", NiveauAcces.LECTURE) is False


def test_user_has_module_access_semantique_union_le_plus_permissif_gagne():
    """Deux rôles du même user sur le même module : le plus permissif l'emporte, quel que soit
    l'ordre d'attribution."""
    user = UserFactory(role=Role.MEMBRE)
    role_lecture = RoleDefinitionFactory(slug="lecteur")
    role_ecriture = RoleDefinitionFactory(slug="editeur")
    RoleModulePermissionFactory(role=role_lecture, module="projets", niveau_acces=NiveauAcces.LECTURE)
    RoleModulePermissionFactory(
        role=role_ecriture, module="projets", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_lecture)
    UserRoleAssignmentFactory(user=user, role=role_ecriture)

    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE_ECRITURE) is True
    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE) is True


def test_user_has_module_access_lecture_seule_insuffisante_pour_ecriture():
    user = UserFactory(role=Role.MEMBRE)
    role_lecture = RoleDefinitionFactory(slug="lecteur-seul")
    RoleModulePermissionFactory(role=role_lecture, module="projets", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_lecture)

    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE) is True
    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE_ECRITURE) is False


def test_user_has_module_access_role_legacy_membre_utilise_la_matrice_seedee():
    """Intégration avec la migration de données 0002 : le rôle système "membre" a été seedé avec
    lecture_ecriture sur "membres" et aucun accès sur "stats" (miroir des seuils déjà en vigueur
    dans apps/membres et apps/stats) — vérifie que le seed est bien exploité par la fonction."""
    user = UserFactory(role=Role.MEMBRE)
    assert user_has_module_access(user, "membres", NiveauAcces.LECTURE_ECRITURE) is True
    assert user_has_module_access(user, "stats", NiveauAcces.LECTURE) is False


# --- is_elevated_for_module ------------------------------------------------------------------


def test_is_elevated_for_module_faux_pour_membre_seul():
    user = UserFactory(role=Role.MEMBRE)
    assert is_elevated_for_module(user, "membres") is False


def test_is_elevated_for_module_vrai_des_quun_role_non_membre_donne_la_lecture():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="vertrieb-elevated")
    RoleModulePermissionFactory(role=role_perso, module="membres", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert is_elevated_for_module(user, "membres") is True


def test_is_elevated_for_module_faux_si_le_role_non_membre_na_aucun_acces_sur_ce_module():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="design-elevated")
    RoleModulePermissionFactory(role=role_perso, module="membres", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    # Le rôle "design-elevated" n'a aucune ligne pour "cotisations" => défaut "aucun".
    assert is_elevated_for_module(user, "cotisations") is False


def test_is_elevated_for_module_ignore_le_role_membre_meme_avec_acces_matrice():
    """Le rôle système actuel de l'utilisateur ("membre" ici) est explicitement exclu de la
    question "élevé ou non", quel que soit son propre niveau d'accès dans la matrice (il a
    lecture_ecriture sur "membres" via le seed, mais ça ne doit jamais suffire à rendre un
    membre "élevé")."""
    user = UserFactory(role=Role.MEMBRE)
    assert is_elevated_for_module(user, "membres") is False


def test_is_elevated_for_module_ignore_aussi_le_role_systeme_actuel_non_membre():
    """Même principe que ci-dessus, mais pour un rôle système AUTRE que "membre" : un compte RH
    nu (aucune UserRoleAssignment supplémentaire) n'est jamais "élevé" par son propre rôle, même
    si le seed lui donne un accès large à un module dans la matrice — ce rôle a déjà sa propre
    logique ROLE_LEVELS ailleurs dans le code (souvent plus fine, voir docstring de module :
    apps.boutique.CommandePermission réserve la liste de toutes les commandes à Bureau Admin+,
    pas à RH, alors même que RH a lecture_ecriture sur "boutique" dans la matrice seedée)."""
    user = UserFactory(role=Role.RH)
    assert is_elevated_for_module(user, "boutique") is False


def test_is_elevated_for_module_vrai_pour_un_role_systeme_avec_un_role_additionnel():
    """Un compte RH devient bien "élevé" dès qu'un rôle VRAIMENT additionnel (personnalisé, ici)
    lui donne un accès sur le module — seul son propre rôle système actuel est exclu."""
    user = UserFactory(role=Role.RH)
    role_perso = RoleDefinitionFactory(slug="vertrieb-plus-rh")
    RoleModulePermissionFactory(role=role_perso, module="boutique", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert is_elevated_for_module(user, "boutique") is True

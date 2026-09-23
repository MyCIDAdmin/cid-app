"""Tests modèles — app rbac : contraintes d'unicité et comportement PROTECT."""

import pytest
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError

from apps.rbac.models import NiveauAcces
from apps.rbac.tests.factories import (
    RoleDefinitionFactory,
    RoleModulePermissionFactory,
    UserFactory,
    UserRoleAssignmentFactory,
)

pytestmark = pytest.mark.django_db


def test_user_role_assignment_unique_par_user_et_role():
    assignation = UserRoleAssignmentFactory()
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            UserRoleAssignmentFactory(user=assignation.user, role=assignation.role)


def test_role_module_permission_unique_par_role_et_module():
    permission = RoleModulePermissionFactory(module="membres")
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RoleModulePermissionFactory(role=permission.role, module="membres")


def test_meme_user_peut_avoir_deux_roles_differents():
    user = UserFactory()
    role1 = RoleDefinitionFactory()
    role2 = RoleDefinitionFactory()
    UserRoleAssignmentFactory(user=user, role=role1)
    UserRoleAssignmentFactory(user=user, role=role2)
    assert user.role_assignments.count() == 2


def test_meme_role_peut_etre_attribue_a_plusieurs_modules_differents():
    role = RoleDefinitionFactory()
    RoleModulePermissionFactory(role=role, module="membres", niveau_acces=NiveauAcces.LECTURE)
    RoleModulePermissionFactory(
        role=role, module="cotisations", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    assert role.module_permissions.count() == 2


def test_suppression_role_encore_attribue_leve_protected_error():
    """`on_delete=PROTECT` — un rôle encore référencé par une UserRoleAssignment ne peut pas être
    supprimé directement au niveau ORM (la vue traduit cette exception en 409, voir test_api.py)."""
    assignation = UserRoleAssignmentFactory()
    with pytest.raises(ProtectedError):
        assignation.role.delete()


def test_suppression_role_non_attribue_reussit():
    role = RoleDefinitionFactory()
    role_id = role.id
    role.delete()
    from apps.rbac.models import RoleDefinition

    assert not RoleDefinition.objects.filter(id=role_id).exists()


def test_suppression_role_module_permission_ne_supprime_pas_le_role():
    """`RoleModulePermission.role` est en CASCADE (pas PROTECT) — c'est la cellule de matrice
    qui dépend du rôle, jamais l'inverse."""
    permission = RoleModulePermissionFactory()
    role = permission.role
    permission.delete()
    role.refresh_from_db()
    assert role is not None

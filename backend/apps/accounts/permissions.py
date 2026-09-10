"""
Classes de permission DRF basées sur les 5 rôles RBAC.
Principe du moindre privilège (SCD §4.1) : par défaut, REFUS.
Voir la matrice complète FDD §2.2 et SCD §4.2.
"""

from rest_framework.permissions import BasePermission

from .models import ROLE_LEVELS, Role


class RoleAtLeast(BasePermission):
    """Permission générique paramétrable : rôle >= niveau minimum requis."""

    min_level = 1

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and ROLE_LEVELS.get(user.role, 0) >= self.min_level
        )


class IsSuperAdmin(RoleAtLeast):
    min_level = ROLE_LEVELS[Role.SUPER_ADMIN]


class IsDirecteurFinancierOrAbove(RoleAtLeast):
    min_level = ROLE_LEVELS[Role.DIR_FINANCIER]


class IsBureauAdminOrAbove(RoleAtLeast):
    min_level = ROLE_LEVELS[Role.BUREAU_ADMIN]


class IsRHOrAbove(RoleAtLeast):
    min_level = ROLE_LEVELS[Role.RH]


class IsOwnerOrAdmin(BasePermission):
    """
    Protection IDOR générique (SCD §4.3) : l'objet doit exposer un attribut
    `membre` ou `user` pointant vers le propriétaire, ou l'utilisateur doit
    être Admin App. En cas de doute, le refus est la valeur par défaut.
    """

    owner_attr_candidates = ("user", "membre_id", "membre__user_id")

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role == Role.SUPER_ADMIN:
            return True
        owner = getattr(obj, "user", None) or getattr(obj, "user_id", None)
        if owner is None and hasattr(obj, "membre"):
            owner = getattr(obj.membre, "user_id", None)
        return owner == user or owner == user.id

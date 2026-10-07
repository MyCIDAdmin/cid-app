"""Lesen ab Rolle RH (alle Verwaltungsrollen), Pflegen und Bewerten ab Bureau Admin."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role


class PartnerPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        level = ROLE_LEVELS.get(user.role, 0)
        mindest = Role.RH if request.method in SAFE_METHODS else Role.BUREAU_ADMIN
        return level >= ROLE_LEVELS[mindest]

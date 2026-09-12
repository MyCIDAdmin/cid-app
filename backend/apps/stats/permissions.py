"""Permissions API — app stats. Écran "Statistiques & KPIs" (CID-RPL-001 §2.3, écrans Release 1) :
accès réservé à Admin, Directeur Financier, Bureau Admin — un seuil ROLE_LEVELS >= Bureau Admin
reproduit exactement cette liste (RH niveau 2 exclu, Membre niveau 1 exclu), même convention que
apps.boutique.permissions.ORDER_VISIBILITY_MIN_LEVEL."""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

STATS_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]


class StatsPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return ROLE_LEVELS.get(user.role, 0) >= STATS_MIN_LEVEL

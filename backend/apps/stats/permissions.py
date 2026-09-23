"""Permissions API — app stats. Écran "Statistiques & KPIs" (CID-RPL-001 §2.3, écrans Release 1) :
page de gestion "Statistiken & KPIs" (Phase D, ajoutée le 2026-09-23, apps.rbac.registry.
PAGES_ADMIN slug `page_stats`) — remplace (et non complète) l'ancien seuil fixe STATS_MIN_LEVEL
(Bureau Admin+, RH niveau 2 exclu, Membre niveau 1 exclu), désormais gardé ici seulement à titre
de valeur de seed pour la migration de données (voir apps/rbac/migrations/
0003_seed_pages_admin_matrice.py)."""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.services import has_admin_page_access

STATS_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]


class StatsPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return has_admin_page_access(user, "page_stats")

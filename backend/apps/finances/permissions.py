"""Permissions — page de gestion `page_finances` (matrice RBAC, voir apps.rbac.registry).
Lecture : niveau `lecture`. Saisie/modification/approbation : `lecture_ecriture`. L'interdiction
d'approuver sa propre saisie (quatre yeux) est vérifiée dans la vue, jamais ici."""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access

PAGE = "page_finances"


class FinancesPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        requis = (
            NiveauAcces.LECTURE if request.method in SAFE_METHODS else NiveauAcces.LECTURE_ECRITURE
        )
        return has_admin_page_access(user, PAGE, requis)

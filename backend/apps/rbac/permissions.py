"""
Permissions — app rbac (ajouté le 2026-09-23).

Deux familles bien distinctes :
  - Les endpoints DE CE MODULE (gérer les rôles/la matrice/la visibilité) sont réservés à
    l'Administrateur App — on réutilise directement `apps.accounts.permissions.IsSuperAdmin`,
    même classe que `ChangeUserRoleView`/`UsersListView`, pas de duplication.
  - `ModuleAccessPermission` (et sa factory `module_access_permission`) est la classe que les 5
    apps métier concernées ajouteront à `permission_classes` en Phase B — EN PLUS de leur classe
    bespoke existante, jamais à la place (DRF combine `permission_classes` en ET logique, la
    composition fail-closed est donc automatique). Elle répond uniquement à la question grossière
    "ce module est-il accessible à ce user, en lecture ou en écriture ?" — la question fine
    ("seulement ses propres données, ou toutes ?") reste dans le code bespoke existant, voir
    services.is_elevated_for_module.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from . import services
from .models import NiveauAcces


class ModuleAccessPermission(BasePermission):
    """Porte grossière : le user a-t-il, via l'UN de ses rôles, au moins l'accès requis
    (lecture pour un GET/HEAD/OPTIONS, lecture_ecriture sinon) sur `self.module` ? Ne remplace
    jamais la classe de permission bespoke déjà en place sur la ViewSet — s'ajoute à elle."""

    module: str = ""  # défini par sous-classe, voir module_access_permission ci-dessous

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        requis = NiveauAcces.LECTURE if request.method in SAFE_METHODS else NiveauAcces.LECTURE_ECRITURE
        return services.user_has_module_access(user, self.module, requis)


def module_access_permission(module: str) -> type[ModuleAccessPermission]:
    """Fabrique une sous-classe de `ModuleAccessPermission` liée à `module` — évite de répéter
    une classe complète par app métier en Phase B. Usage :
    `permission_classes = [MembrePermission, module_access_permission("membres")]`."""
    return type(f"ModuleAccessPermission_{module}", (ModuleAccessPermission,), {"module": module})

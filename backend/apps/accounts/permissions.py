"""
Classes de permission DRF basées sur les 5 rôles RBAC.
Principe du moindre privilège (SCD §4.1) : par défaut, REFUS.
Voir la matrice complète FDD §2.2 et SCD §4.2.
"""

from rest_framework.permissions import BasePermission

from .models import ROLE_LEVELS, Role


def _has_admin_page_access(user, page_slug: str, required: str | None = None) -> bool:
    """Import différé (et non en tête de module) — évite qu'un import circulaire au chargement
    de l'app (apps.accounts est chargée très tôt, avant apps.rbac dans certains contextes,
    notamment les migrations) ne casse le démarrage. Voir HasInscriptionsAdminAccess ci-dessous.
    `required` (ajouté le 2026-09-24) : None = valeur par défaut de has_admin_page_access
    (`lecture`, import différé aussi pour NiveauAcces afin de ne pas casser l'ordre de chargement
    ci-dessus)."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.services import has_admin_page_access

    return has_admin_page_access(user, page_slug, required=required or NiveauAcces.LECTURE)


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


class HasInscriptionsAdminAccess(BasePermission):
    """Page de gestion "Registrierungen" (Phase D, ajoutée le 2026-09-23, apps.rbac.registry.
    PAGES_ADMIN slug `page_inscriptions`) — dédiée aux 3 vues de validation des inscriptions
    libre-service (PendingRegistrationsView/ApproveRegistrationView/RefuseRegistrationView,
    apps/accounts/views.py). Remplace `IsRHOrAbove` UNIQUEMENT à ces 3 endroits : `IsRHOrAbove`
    lui-même reste inchangé pour ses autres usages (apps.membres.import_views,
    apps.membres.export_views), aucune des deux pages listées par l'utilisateur.

    Niveau `lecture` (consultation de la file d'attente, PendingRegistrationsView) — voir
    HasInscriptionsAdminWriteAccess ci-dessous pour Approve/RefuseRegistrationView, qui
    requièrent `lecture_ecriture` depuis le 2026-09-24 (retour utilisateur — voir
    apps.communaute.permissions.QuizPermission pour le contexte complet)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and _has_admin_page_access(user, "page_inscriptions")
        )


class HasInscriptionsAdminWriteAccess(HasInscriptionsAdminAccess):
    """Approuver/refuser une inscription (ApproveRegistrationView/RefuseRegistrationView) — même
    page que HasInscriptionsAdminAccess ci-dessus, mais niveau `lecture_ecriture` requis."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and _has_admin_page_access(
                user, "page_inscriptions", required="lecture_ecriture"
            )
        )


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

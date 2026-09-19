"""Permissions API — app notifications. Aucune notion de rôle : chacun ne voit et ne modifie que
ses propres notifications (IDOR — SCD §2.3 A01, même défense en profondeur que
CotisationPermission/SouscriptionPermission/CommandePermission)."""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role


class NotificationPermission(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        return obj.destinataire_id == request.user.id


# Réservé à l'Administrateur App (Role.SUPER_ADMIN) — "vom App Admin verwaltbar", demande
# utilisateur du 2026-09-19, même niveau que GESTION_ARTICLES_MIN_LEVEL côté apps.cotisations.
PARAMETRES_NOTIFICATION_MIN_LEVEL = ROLE_LEVELS[Role.SUPER_ADMIN]


class ParametresNotificationPermission(BasePermission):
    """Lecture ET écriture réservées à l'Administrateur App — contrairement à
    ArticleCataloguePermission (lecture ouverte), ce paramétrage n'a pas vocation à être consulté
    par un membre normal ni même par un rôle de gestion RH/Bureau/DF."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= PARAMETRES_NOTIFICATION_MIN_LEVEL
        )

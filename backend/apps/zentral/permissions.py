from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

EINSTELLUNGEN_MIN_LEVEL = ROLE_LEVELS[Role.SUPER_ADMIN]


class ZentraleEinstellungenPermission(BasePermission):
    """Lesen: jede angemeldete Person (die Oberfläche zeigt z. B. die Dauer der Reservierung).
    Ändern: nur der App-Administrator."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return ROLE_LEVELS.get(user.role, 0) >= EINSTELLUNGEN_MIN_LEVEL

"""
Permissions API — app cotisations (FDD §2.2 matrice des permissions) :

  - list / retrieve : authentifié. RH et au-dessus voient toutes les cotisations (RH : "consulter
    les cotisations en lecture seule" — FDD §2.1). Un rôle < RH ne voit que ses propres
    cotisations (celles de la fiche Membre liée à son compte) — voir CotisationViewSet.get_queryset
    et has_object_permission (défense en profondeur, IDOR — SCD §2.3 A01).
  - create : authentifié. Un membre normal ne peut créer une cotisation que pour lui-même (voir
    CotisationViewSet.perform_create). Saisir une transaction pour le compte d'un AUTRE membre
    (RICEFW F-015) est réservé à Directeur Financier et Administrateur App.
  - Pas d'update/destroy exposés : voir views.py (registre financier append-only).
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

READ_ALL_MIN_LEVEL = ROLE_LEVELS[Role.RH]
SAISIE_POUR_AUTRUI_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]


class CotisationPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id

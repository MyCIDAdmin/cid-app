"""
Permissions API — app membres (SCD §2.2/§2.3 A01 : IDOR sur les endpoints
membres = risque critique. Principe du moindre privilège : par défaut refus.

Matrice (TDD §2.4) :
  - list / retrieve   : authentifié. Un rôle < RH ne voit/peut consulter que
                         sa propre fiche (voir MembreViewSet.get_queryset) ;
                         cette permission referme la porte au niveau objet en
                         plus, en défense en profondeur.
  - create / update    : RH ou plus.
  - destroy             : Bureau Admin ou plus (suppression = action plus
                         sensible qu'une simple mise à jour).
  - changer_statut      : RH ou plus (TDD §2.4 : "POST /membres/{id}/
                         changer_statut/ — RH+").
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

WRITE_ACTIONS = ("create", "update", "partial_update", "changer_statut")
DESTROY_ACTIONS = ("destroy",)


class MembrePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        action = getattr(view, "action", None)
        if action in WRITE_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.RH]
        if action in DESTROY_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]
        # list, retrieve : ouvert à tout authentifié — le scope réel est
        # appliqué par le queryset (get_queryset) et par has_object_permission.
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.RH]:
            return True
        # Rôle MEMBRE (ou non renseigné) : uniquement sa propre fiche.
        # create/update/destroy sont déjà bloqués pour ce rôle par
        # has_permission ci-dessus — on n'arrive ici que pour du GET.
        return obj.user_id == user.id

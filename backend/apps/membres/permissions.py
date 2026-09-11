"""
Permissions API — app membres (SCD §2.2/§2.3 A01 : IDOR sur les endpoints
membres = risque critique. Principe du moindre privilège : par défaut refus.

Matrice (TDD §2.4, complétée par AHM-51 — un Membre peut désormais modifier
sa propre fiche, pas seulement la consulter) :
  - list / retrieve      : authentifié. Un rôle < RH ne voit/peut consulter
                            que sa propre fiche (voir
                            MembreViewSet.get_queryset) ; cette permission
                            referme la porte au niveau objet en plus, en
                            défense en profondeur.
  - update / partial_update : RH+ peut modifier n'importe quelle fiche ; un
                            rôle < RH ne peut modifier QUE la sienne (verrouillé
                            ici, au niveau objet) et UNIQUEMENT ses champs
                            personnels — les champs administratifs (user,
                            statut, date_adhesion) sont verrouillés en lecture
                            seule pour lui côté serializer, voir
                            MembreSerializer._CHAMPS_ADMINISTRATIFS.
  - create                : RH ou plus (la fiche Membre est de toute façon
                            déjà créée automatiquement à l'auto-inscription,
                            voir AHM-50 — un Membre n'a jamais besoin de
                            créer une fiche lui-même).
  - destroy                : Bureau Admin ou plus (suppression = action plus
                            sensible qu'une simple mise à jour).
  - changer_statut         : RH ou plus (TDD §2.4 : "POST /membres/{id}/
                            changer_statut/ — RH+") — volontairement à part
                            de update/partial_update pour qu'un Membre ne
                            puisse jamais changer son propre statut, même
                            indirectement.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

ADMIN_WRITE_ACTIONS = ("create", "changer_statut")
DESTROY_ACTIONS = ("destroy",)


class MembrePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        action = getattr(view, "action", None)
        if action in ADMIN_WRITE_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.RH]
        if action in DESTROY_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]
        # list, retrieve, update, partial_update : ouvert à tout authentifié —
        # le scope réel (quelle fiche, quels champs) est appliqué par
        # get_queryset, has_object_permission ci-dessous, et par le
        # serializer pour le verrouillage champ par champ.
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.RH]:
            return True
        # Rôle MEMBRE (ou non renseigné) : uniquement sa propre fiche.
        # create/changer_statut/destroy sont déjà bloqués pour ce rôle par
        # has_permission ci-dessus — on n'arrive ici que pour GET/PATCH/PUT.
        return obj.user_id == user.id

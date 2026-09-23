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
  - ArticleCatalogue (ajouté le 2026-09-17, retour utilisateur : catalogue d'articles de paiement
    géré par l'App-Admin) : list/retrieve — tout authentifié (un membre doit voir les articles
    actifs pour les choisir dans le stepper), scope à actif=True pour tout rôle < Administrateur
    App (voir ArticleCatalogueViewSet.get_queryset). create/update/partial_update — réservé à
    l'Administrateur App (Role.SUPER_ADMIN), décision actée avec l'utilisateur ("APP-Admin"
    littéralement). Pas de destroy exposé : jamais de suppression physique, seulement
    actif=False (voir models.py).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.services import is_elevated_for_module

READ_ALL_MIN_LEVEL = ROLE_LEVELS[Role.RH]
SAISIE_POUR_AUTRUI_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]
GESTION_ARTICLES_MIN_LEVEL = ROLE_LEVELS[Role.SUPER_ADMIN]


class CotisationPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_MIN_LEVEL:
            return True
        # apps.rbac Phase B (ajouté le 2026-09-23) : un rôle personnalisé avec au moins la
        # lecture sur le module "cotisations" voit TOUTES les cotisations, comme RH/Admin —
        # porte OUVERTE EN PLUS, jamais un remplacement de la condition ci-dessus.
        if is_elevated_for_module(user, "cotisations"):
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id


class ArticleCataloguePermission(BasePermission):
    """ArticleCatalogue — lecture ouverte à tout authentifié, écriture réservée à
    l'Administrateur App (voir docstring de module)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return ROLE_LEVELS.get(user.role, 0) >= GESTION_ARTICLES_MIN_LEVEL

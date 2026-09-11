"""
Permissions API — app boutique (FDD §2.2 matrice des permissions) :

  - Produit / VarianteProduit : lecture ouverte à tout authentifié (catalogue publié
    uniquement pour un rôle < Bureau Admin — voir get_queryset côté vues, même principe
    que OffreAdhesionViewSet). Écriture (create/update/partial_update/destroy) réservée
    au Bureau Admin+ ("Boutique — créer/modifier produit" = Oui uniquement Admin/Bureau).

  - Commande : create — tout authentifié, toujours pour soi-même (voir views.py) ; la
    matrice FDD §2.2 autorise "commander" à Admin/DG/Bureau/Membre (RH n'est pas cité —
    en pratique RH commande alors comme un membre normal, pas de restriction technique
    ici). list/retrieve — la ligne "Boutique — voir commandes" de la matrice donne
    Oui/Oui/Oui/Non/Non(propres) pour Admin/DG/Bureau/RH/Membre : un simple seuil
    ROLE_LEVELS >= Bureau Admin reproduit exactement cette matrice, RH (niveau 2) restant
    sous le seuil Bureau Admin (niveau 3) alors que Directeur Financier (niveau 4) et
    Admin App (niveau 5) le dépassent — voir ORDER_VISIBILITY_MIN_LEVEL. En dessous de ce
    seuil (Membre, RH), un utilisateur ne voit que ses propres commandes (IDOR — SCD §2.3
    A01, même défense en profondeur que CotisationPermission/SouscriptionPermission).
  - `changer_statut` (traiter une commande : confirmer/expédier/rembourser...) réservé au
    même seuil Bureau Admin+ ("Admin App... traiter toutes les commandes", cas d'usage
    FDD §2.3). `annuler` reste ouvert au propriétaire de la commande en plus du Bureau
    Admin+ (voir has_object_permission).
  - Pas de update/destroy génériques exposés sur Commande : elle n'évolue que via les
    actions `annuler`/`changer_statut` (registre append-only, même convention que
    Cotisation/Souscription).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

GESTION_CATALOGUE_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]
ORDER_VISIBILITY_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]

CATALOGUE_WRITE_ACTIONS = ("create", "update", "partial_update", "destroy")


class CatalogueBoutiquePermission(BasePermission):
    """Produit / VarianteProduit."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in CATALOGUE_WRITE_ACTIONS or request.method not in SAFE_METHODS:
            return ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        return True


class CommandePermission(BasePermission):
    GESTION_ACTIONS = ("changer_statut",)

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(view, "action", None) in self.GESTION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id

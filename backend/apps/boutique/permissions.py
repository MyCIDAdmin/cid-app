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
  - `changer_statut` (traiter une commande : mettre en préparation/rembourser/livrer...)
    réservé au même seuil Bureau Admin+ ("Admin App... traiter toutes les commandes", cas
    d'usage FDD §2.3). `annuler` reste ouvert au propriétaire de la commande en plus du
    Bureau Admin+ (voir has_object_permission).
  - `confirmer_paiement` / `expedier` (demande utilisateur du 2026-09-15 : confirmer la
    réception d'un paiement puis autoriser l'expédition) sont réservés à un seuil plus
    strict, PAIEMENT_EXPEDITION_MIN_LEVEL (Directeur Financier+) — même principe et même
    niveau que `Cotisation.marquer_payee`/SAISIE_POUR_AUTRUI_MIN_LEVEL (AHM-53) : c'est un
    geste financier (réception d'argent conditionnant l'envoi de marchandise), pas une
    simple gestion de statut. Le Bureau Admin garde un accès en lecture/gestion générale
    (changer_statut) mais pas celui-ci.
  - Retour (retours partiels par ligne) : création réservée au même seuil que la gestion
    générale des commandes, ORDER_VISIBILITY_MIN_LEVEL (Bureau Admin+) — pas au niveau
    Directeur Financier de confirmer_paiement/expedier, la retoure ne déclenchant ici ni
    remboursement automatique ni mouvement financier (voir Retour.__doc__), seulement une
    réintégration de stock.
  - Pas de update/destroy génériques exposés sur Commande : elle n'évolue que via ses
    actions dédiées (registre append-only, même convention que Cotisation/Souscription).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

GESTION_CATALOGUE_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]
ORDER_VISIBILITY_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]
PAIEMENT_EXPEDITION_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]

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
    PAIEMENT_EXPEDITION_ACTIONS = ("confirmer_paiement", "expedier")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in self.PAIEMENT_EXPEDITION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= PAIEMENT_EXPEDITION_MIN_LEVEL
        if action in self.GESTION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id


class RetourPermission(BasePermission):
    """Retour — voir docstring de module : même seuil que la gestion générale des commandes
    (ORDER_VISIBILITY_MIN_LEVEL, Bureau Admin+), lecture et création confondues (pas de cas
    d'usage "un membre consulte ses propres retours" dans la demande — l'admin gère tout)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return ROLE_LEVELS.get(user.role, 0) >= ORDER_VISIBILITY_MIN_LEVEL

"""
Permissions API — app communaute, lot Fil d'actualité + Forum (CID-SCD-001 §résumé
"Forum / Fil — RBAC").

Règle commune aux deux sous-modules :
  - Lecture (list/retrieve) et création (create) : tout authentifié — pas de rôle
    minimum, à la différence de la Boutique (catalogue Bureau Admin+ en écriture). Le
    Forum/Fil est un espace social ouvert à tous les membres actifs (FDD §1.3 "Dans le
    périmètre" ne restreint pas Forum/Fil à un rôle).
  - Modifier/supprimer SON PROPRE contenu (publication, commentaire, sujet, réponse) :
    propriétaire uniquement (IDOR, même principe que CommandePermission).
  - Modération (masquer/épingler/verrouiller du contenu d'autrui) : Bureau Admin+
    uniquement (CID-SCD-001 "Modération admin"), même seuil que
    apps.boutique.permissions.GESTION_CATALOGUE_MIN_LEVEL.
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import ROLE_LEVELS, Role

MODERATION_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]

# Actions de modération exposées par les ViewSets (voir views.py) — jamais accessibles au
# simple propriétaire du contenu, uniquement Bureau Admin+.
MODERATION_ACTIONS = ("masquer", "epingler", "verrouiller")


def _membre_de(user):
    return getattr(user, "membre", None)


class ContenuCommunautePermission(BasePermission):
    """Permission générique pour Publication/Commentaire/Sujet/ReponseForum : partagée
    car les 4 modèles suivent exactement la même matrice (voir docstring module)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in MODERATION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        action = getattr(view, "action", None)
        if action in MODERATION_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        if action in ("update", "partial_update", "destroy"):
            membre = _membre_de(user)
            est_proprietaire = membre is not None and getattr(obj, "auteur_id", None) == membre.id
            return est_proprietaire or ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        return True

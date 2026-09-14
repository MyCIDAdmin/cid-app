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


# ---------------------------------------------------------------------------
# Messagerie privée + Groupes de chat (deuxième lot — CID-SCD-001 §résumé
# "Messagerie privée — chiffrée, accès strictement limité aux 2 participants")
# ---------------------------------------------------------------------------


class ConversationPermission(BasePermission):
    """Liste/création ouvertes à tout authentifié ; l'accès à UNE conversation (retrieve)
    est strictement limité à ses 2 participants — IDOR le plus sensible du module car la
    Messagerie privée est chiffrée précisément pour rester confidentielle."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        membre = _membre_de(request.user)
        return membre is not None and obj.participant(membre)


class MessagePrivePermission(BasePermission):
    """Authentifié uniquement — l'appartenance à la conversation ciblée par `?conversation=`
    est vérifiée explicitement dans `MessagePriveViewSet.get_queryset` (403 plutôt qu'une
    liste vide silencieuse, pour ne pas laisser croire à une conversation inexistante)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)


class GroupeChatPermission(BasePermission):
    """Création ouverte à tout authentifié. Lecture (list/retrieve) : groupes publics OU
    dont le membre fait déjà partie — filtré dans `GroupeChatViewSet.get_queryset`, avec un
    contrôle objet en complément pour `retrieve`. Modifier/supprimer : créateur ou Bureau
    Admin+. `rejoindre` : groupes publics uniquement (un groupe privé se rejoint par
    invitation, voir `inviter`, réservée au créateur/Bureau Admin+). `quitter` : tout membre
    actuel du groupe."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action == "inviter":
            return True  # contrôle fin fait dans has_object_permission (créateur/Bureau Admin+)
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        membre = _membre_de(user)
        action = getattr(view, "action", None)
        est_createur = membre is not None and obj.createur_id == membre.id
        est_admin = ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        if action in ("update", "partial_update", "destroy", "inviter"):
            return est_createur or est_admin
        if action == "retrieve":
            if obj.type_groupe == "public":
                return True
            return membre is not None and obj.membres_groupe.filter(membre=membre).exists()
        if action == "rejoindre":
            return obj.type_groupe == "public"
        if action == "quitter":
            return membre is not None and obj.membres_groupe.filter(membre=membre).exists()
        return True

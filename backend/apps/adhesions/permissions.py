"""
Permissions API — app adhesions (FDD §2.2 matrice des permissions / §6.1) :

  - Catalogue (CampagneAdhesion, OffreAdhesion, RabaisOffre) : lecture (list/retrieve/active)
    ouverte à tout utilisateur authentifié — un membre doit pouvoir consulter les offres pour
    souscrire. Écriture (create/update/partial_update/destroy/publier/cloturer) réservée au
    Bureau Administratif et au-dessus (FDD §2.1 : gestion des campagnes = Bureau Admin).
  - Souscription : list/retrieve — RH et au-dessus voient toutes les souscriptions ; un rôle
    < RH ne voit que les siennes (celles de la fiche Membre liée à son compte), même défense en
    profondeur IDOR que CotisationPermission (SCD §2.3 A01). create (souscrire) — authentifié,
    toujours pour soi-même (voir views.SouscriptionViewSet.souscrire) : pas de "souscrire pour
    autrui" dans ce module (à la différence de cotisations F-015).
  - Pas d'update/destroy exposés sur Souscription : une fois créée, elle évolue uniquement via
    son statut (paiement, validation de justificatif, annulation — AHM-20/AHM-46, demande
    utilisateur du 2026-09-16 pour "annuler"), jamais réécrite librement par l'API ; une
    souscription payée ne peut jamais être supprimée ni annulée (voir
    views.STATUTS_SOUSCRIPTION_ANNULABLES). L'action annuler() réutilise has_object_permission
    ci-dessous (propriétaire ou RH+) : pas de classe de permission dédiée.
  - JustificatifRabais (AHM-20) : create (upload) — authentifié, toujours pour sa propre
    souscription (vérifié dans le serializer, qui a accès aux données du payload — has_
    permission ne les a pas encore), SAUF pour RH et au-dessus qui peuvent uploader pour le
    compte de n'importe quel membre (demande utilisateur du 2026-09-16 — voir
    JustificatifRabaisViewSet.create/JustificatifRabaisUploadSerializer.validate_souscription).
    list (file RH) et valider — RH et au-dessus uniquement. retrieve/telecharger — RH+ ou
    membre propriétaire (même principe IsRHOrAbove | IsJustificatifOwner que le TDD, ici en une
    seule classe pour rester cohérent avec SouscriptionPermission ci-dessus).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.services import is_elevated_for_module

GESTION_CATALOGUE_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]
READ_ALL_SOUSCRIPTIONS_MIN_LEVEL = ROLE_LEVELS[Role.RH]

CATALOGUE_WRITE_ACTIONS = (
    "create",
    "update",
    "partial_update",
    "destroy",
    "publier",
    "cloturer",
)


class CataloguePermission(BasePermission):
    """CampagneAdhesion / OffreAdhesion / RabaisOffre."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in CATALOGUE_WRITE_ACTIONS or request.method not in SAFE_METHODS:
            return ROLE_LEVELS.get(user.role, 0) >= GESTION_CATALOGUE_MIN_LEVEL
        return True


class SouscriptionPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL:
            return True
        # apps.rbac Phase B (ajouté le 2026-09-23) : un rôle personnalisé avec au moins la
        # lecture sur le module "adhesions" voit TOUTES les souscriptions, comme RH/Admin —
        # porte OUVERTE EN PLUS, jamais un remplacement de la condition ci-dessus.
        if is_elevated_for_module(user, "adhesions"):
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id


class JustificatifPermission(BasePermission):
    """JustificatifRabais — voir le docstring du module pour la matrice par action."""

    RH_ONLY_ACTIONS = ("list", "valider")

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(view, "action", None) in self.RH_ONLY_ACTIONS:
            return ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= READ_ALL_SOUSCRIPTIONS_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.souscription.membre_id == membre.id

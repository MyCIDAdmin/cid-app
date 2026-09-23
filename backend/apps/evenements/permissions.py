"""
Permissions API — app evenements (FDD §2.2) :

  - Evenement : lecture ouverte à tout authentifié pour les événements publiés ; un
    brouillon n'est visible qu'au Bureau Admin+ (voir get_queryset côté vues). Écriture
    (create/update/partial_update/destroy/publier/annuler) réservée au Bureau Admin+
    (FDD §2.2 : "Événements — créer/modifier" = Oui uniquement Admin/Bureau).
  - Inscription : create — authentifié, toujours pour soi-même (voir views.py). list/
    retrieve — Bureau Admin+ voit toutes les inscriptions (organisateurs) ; un rôle
    inférieur ne voit que les siennes, même défense IDOR que CotisationPermission/
    SouscriptionPermission (SCD §2.3 A01). Pas d'update/destroy exposés : une inscription
    n'évolue que via l'action `annuler`.
  - Covoiturage : lecture ouverte à tout authentifié (liste communautaire des trajets,
    mockup #pg-evenements onglet Covoiturage). Écriture (update/destroy) réservée au
    conducteur du trajet ou au Bureau Admin+ ; create — tout authentifié (propose pour
    lui-même, voir views.py).
  - ReservationCovoiturage : create — authentifié, pour soi-même. list/retrieve — le
    conducteur du trajet voit ses réservations, un membre voit les siennes, Bureau Admin+
    voit tout.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.services import has_admin_page_access, is_elevated_for_module

GESTION_EVENEMENTS_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]

EVENEMENT_WRITE_ACTIONS = (
    "create",
    "update",
    "partial_update",
    "destroy",
    "publier",
    "annuler",
)


class EvenementPermission(BasePermission):
    """`inscrire` est un POST sur ce même ViewSet mais n'est PAS un acte de gestion du
    catalogue (n'importe quel authentifié doit pouvoir s'inscrire) — on gate donc
    explicitement sur la liste d'actions plutôt que sur `request.method` (qui inclurait
    à tort ce POST), à la différence de CataloguePermission (adhesions) qui n'a pas ce cas.
    Les actions de gestion (EVENEMENT_WRITE_ACTIONS) forment la page "Veranstaltungsverwaltung"
    (Phase D, ajoutée le 2026-09-23, slug `page_events`) — remplace (et non complète) l'ancien
    seuil fixe GESTION_EVENEMENTS_MIN_LEVEL."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in EVENEMENT_WRITE_ACTIONS:
            return has_admin_page_access(user, "page_events")
        return True


class InscriptionPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL:
            return True
        # apps.rbac Phase B (ajouté le 2026-09-23) : un rôle personnalisé avec au moins la
        # lecture sur le module "evenements" voit TOUTES les inscriptions, comme Bureau Admin+ —
        # porte OUVERTE EN PLUS, jamais un remplacement de la condition ci-dessus.
        if is_elevated_for_module(user, "evenements"):
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.membre_id == membre.id


class CovoiturageWritePermission(BasePermission):
    """Lecture ouverte à tout authentifié ; écriture réservée au conducteur du trajet ou
    au Bureau Admin+ (create toujours autorisé — vérifié pour soi-même dans views.py)."""

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return True

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        return membre is not None and obj.conducteur_id == membre.id


class ReservationCovoituragePermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if ROLE_LEVELS.get(user.role, 0) >= GESTION_EVENEMENTS_MIN_LEVEL:
            return True
        membre = getattr(user, "membre", None)
        if membre is None:
            return False
        return obj.membre_id == membre.id or obj.trajet.conducteur_id == membre.id

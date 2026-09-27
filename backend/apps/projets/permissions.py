"""
Permissions API — app projets (module "Projets & Actions", ajouté le 2026-09-22 sur
demande utilisateur, voir docstring de module de models.py pour le détail des 8 points) :

  - Projet : lecture (list/retrieve) ouverte à tout authentifié — mais un projet en
    statut EN_PREPARATION reste masqué à un rôle < Bureau Admin (voir
    ProjetViewSet.get_queryset, même principe que Produit.statut="brouillon" ou
    OffreAdhesionViewSet). Écriture (create/update/partial_update/destroy — titre,
    statut, cagnote_active, objectif_montant, date_limite, responsable, ordre) réservée
    au Bureau Admin+ (GESTION_PROJETS_MIN_LEVEL) — décision actée avec la demande
    ("Modul für Projekte und Aktionen mit Verwaltung für Admin"). Le·la responsable
    assigné ne peut PAS modifier ces champs du Projet lui-même, seulement le contenu de
    sa kachel (images, mises à jour) — voir GestionContenuProjetPermission ci-dessous.

  - `contributeurs` (face arrière de la kachel, demande utilisateur point 5 : "Details
    zu den Mitgliedern die beigetragen haben") : lecture ouverte à tout authentifié, au
    même titre que le Projet lui-même — c'est une information montrée à tous les
    membres qui consultent la kachel, pas réservée à l'admin.

  - Images de projet (ProjetImage) et mises à jour (ProjetMiseAJour + leurs images) :
    lecture ouverte à tout authentifié (carrousel / rapport d'avancement visibles par
    tous les membres, comme Projet lui-même). Écriture (ajout/suppression) ouverte au
    Bureau Admin+ OU, en plus, au membre "responsable" du projet CONCERNÉ (demande
    utilisateur point 1.1 : "Der Admin und der Verantwortliche") — vérification faite au
    niveau de l'objet Projet référencé par l'image/la mise à jour, jamais un rôle
    générique "responsable" indépendant du projet (un responsable d'un autre projet ne
    doit pas pouvoir gérer celui-ci). Pour les actions de création (pas d'objet DRF
    existant, has_object_permission n'est alors pas appelée), la vue vérifie elle-même
    `est_gestionnaire_projet(request.user, projet)` avant d'enregistrer — voir
    apps.projets.views (même convention que CotisationViewSet.perform_create pour la
    saisie-pour-autrui).
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import ROLE_LEVELS, Role
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access

GESTION_PROJETS_MIN_LEVEL = ROLE_LEVELS[Role.BUREAU_ADMIN]


def est_gestionnaire_projet(user, projet) -> bool:
    """Bureau Admin+ OU le membre responsable de CE projet précis — voir docstring de
    module. Utilisée à la fois par GestionContenuProjetPermission.has_object_permission
    (objet existant) et par les vues à la création (voir apps.projets.views)."""
    if not user or not user.is_authenticated:
        return False
    if ROLE_LEVELS.get(user.role, 0) >= GESTION_PROJETS_MIN_LEVEL:
        return True
    membre = getattr(user, "membre", None)
    return (
        membre is not None
        and projet.responsable_id is not None
        and projet.responsable_id == membre.id
    )


class ProjetPermission(BasePermission):
    """Projet — lecture ouverte à tout le monde, y compris un visiteur anonyme depuis le
    2026-09-26 (page d'accueil publique façon mycid.org/projects, demande utilisateur) —
    ProjetViewSet.get_queryset masque déjà "en_preparation" à qui n'est pas Bureau Admin+, ce
    qui s'applique donc aussi à un anonyme sans changement supplémentaire. Écriture = page de
    gestion "Projekt- & Aktionsverwaltung" (Phase D, ajoutée le 2026-09-23,
    apps.rbac.registry.PAGES_ADMIN slug `page_projets`) — remplace (et non complète) l'ancien
    seuil fixe GESTION_PROJETS_MIN_LEVEL. `contributeurs` ouverte à tout le monde (voir docstring
    de module), déjà couverte par la branche SAFE_METHODS ci-dessous puisque c'est une action GET.
    NE remplace PAS `est_gestionnaire_projet` ci-dessous (exception objet-spécifique "responsable
    de CE projet", utilisée par GestionContenuProjetPermission), qui reste inchangée."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return False
        return has_admin_page_access(user, "page_projets", required=NiveauAcces.LECTURE_ECRITURE)


class GestionContenuProjetPermission(BasePermission):
    """ProjetImage / ProjetMiseAJour / ProjetMiseAJourImage — lecture ouverte à tout le monde
    (y compris anonyme depuis le 2026-09-26, même raisonnement que ProjetPermission ci-dessus :
    carrousel/rapport d'avancement visibles sur la page d'accueil publique), écriture Bureau
    Admin+ OU responsable du projet référencé (voir docstring de module et
    est_gestionnaire_projet)."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(user and user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        # ProjetImage a un champ `projet` direct ; ProjetMiseAJourImage n'a que
        # `mise_a_jour` (voir models.py) — on remonte jusqu'au Projet dans ce cas.
        projet = obj.projet if hasattr(obj, "projet") else obj.mise_a_jour.projet
        return est_gestionnaire_projet(request.user, projet)

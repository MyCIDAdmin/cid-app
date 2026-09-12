"""
Permissions API — app vote (SCD §4.2 matrice, FDD §2.2) :

  - POST /votes/ (créer + lancer une session) et POST /votes/{id}/cloturer/ : Admin App
    et Bureau Admin UNIQUEMENT (SCD §4.2 : Dir. Financier ✗ et RH ✗ explicitement exclus,
    malgré un niveau ROLE_LEVELS supérieur à Bureau Admin — la gestion des votes n'est
    donc PAS une simple hiérarchie "role >= niveau minimum" comme RoleAtLeast/
    IsBureauAdminOrAbove : c'est un ensemble de rôles précis, vérifié explicitement plutôt
    que par comparaison de niveau, à la différence de la plupart des autres permissions du
    projet).
  - GET /votes/ et GET /votes/{id}/ : tout authentifié (consultation des sessions passées/
    en cours, mockup #pg-vote accessible à tout membre).
  - GET /votes/{id}/resultats/ : tout authentifié, mais seulement après clôture (SCD §4.2 :
    "Membre ✓ (après clôture)") — vérifié dans la vue (VoteSession.resultats_visibles),
    pas ici (ce n'est pas une question de rôle mais d'état de la session).
"""

from rest_framework.permissions import BasePermission

from apps.accounts.models import Role

ROLES_GESTION_VOTE = (Role.SUPER_ADMIN, Role.BUREAU_ADMIN)

VOTE_WRITE_ACTIONS = ("create", "cloturer")


class VoteSessionPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        action = getattr(view, "action", None)
        if action in VOTE_WRITE_ACTIONS:
            return user.role in ROLES_GESTION_VOTE
        return True

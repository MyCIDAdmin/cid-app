"""
Logique métier — app rbac (ajouté le 2026-09-23). Trois fonctions, chacune un point d'entrée
unique réutilisé partout (permissions.py de ce module ET, en Phase B, les 5 `permissions.py`
bespoke des apps métier) :

  - `get_user_role_slugs` : l'ensemble EFFECTIF des rôles d'un utilisateur — legacy CharField
    (`user.role`) + toutes les lignes `UserRoleAssignment` actives. Le CharField fait TOUJOURS
    partie de l'ensemble, avec ou sans ligne d'attribution : garantit qu'un compte jamais passé
    par la nouvelle UI de gestion des rôles (donc sans aucune ligne UserRoleAssignment) continue
    de se comporter exactement comme avant ce module.
  - `user_has_module_access` : la question que pose la matrice ("ce rôle a-t-il accès à ce
    module ?"), avec sémantique d'union multi-rôle — le plus permissif des rôles de l'utilisateur
    gagne.
  - `is_elevated_for_module` : la question que pose la Phase B ("ce user doit-il voir TOUTES les
    données du module, ou seulement les siennes ?") — vrai dès qu'un rôle AUTRE que le rôle
    système "membre" donne au moins un accès en lecture sur ce module.
"""

from .models import NiveauAcces, RoleModulePermission

_NIVEAUX_ORDONNES = {
    NiveauAcces.AUCUN: 0,
    NiveauAcces.LECTURE: 1,
    NiveauAcces.LECTURE_ECRITURE: 2,
}


def get_user_role_slugs(user) -> set[str]:
    """L'ensemble effectif des rôles d'un utilisateur — voir docstring de module. `user.role`
    (legacy CharField, toujours renseigné, défaut "membre") est TOUJOURS inclus."""
    if not user or not getattr(user, "is_authenticated", False):
        return set()
    slugs = {user.role}
    slugs |= {
        assignation.role.slug
        for assignation in user.role_assignments.select_related("role").filter(role__actif=True)
    }
    return slugs


def _niveau_acces_pour(role_slug: str, module: str) -> str:
    """Niveau d'accès d'UN rôle (par son slug) sur UN module — défaut "aucun" en l'absence de
    ligne (voir docstring de RoleModulePermission)."""
    ligne = (
        RoleModulePermission.objects.filter(role__slug=role_slug, module=module)
        .values_list("niveau_acces", flat=True)
        .first()
    )
    return ligne or NiveauAcces.AUCUN


def user_has_module_access(user, module: str, required: str) -> bool:
    """True si l'UNION des rôles de l'utilisateur atteint au moins `required`
    (NiveauAcces.LECTURE ou NiveauAcces.LECTURE_ECRITURE) sur `module`. Aucun rôle => False
    (moindre privilège par défaut, SCD §4.1)."""
    slugs = get_user_role_slugs(user)
    if not slugs:
        return False
    meilleur = max(_NIVEAUX_ORDONNES[_niveau_acces_pour(s, module)] for s in slugs)
    return meilleur >= _NIVEAUX_ORDONNES[required]


def is_elevated_for_module(user, module: str) -> bool:
    """True dès qu'un rôle de l'utilisateur AUTRE que le rôle système "membre" accorde au moins
    la lecture sur ce module — sémantique d'union multi-rôle, voir docstring de module. Utilisé
    en Phase B par les `permissions.py` bespoke des apps métier pour décider "toutes les données"
    vs "seulement les miennes", en plus (jamais à la place) de leur logique ROLE_LEVELS
    existante."""
    autres_roles = get_user_role_slugs(user) - {"membre"}
    if not autres_roles:
        return False
    return any(
        _NIVEAUX_ORDONNES[_niveau_acces_pour(slug, module)] >= _NIVEAUX_ORDONNES[NiveauAcces.LECTURE]
        for slug in autres_roles
    )

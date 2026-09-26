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
    données du module, ou seulement les siennes ?") — vrai dès qu'un rôle ADDITIONNEL, au-delà du
    rôle système ACTUEL de l'utilisateur (le CharField legacy `user.role`), donne au moins un
    accès en lecture sur ce module. Exclut délibérément le rôle système actuel lui-même (pas
    seulement "membre") : ce rôle a déjà sa propre logique ROLE_LEVELS, souvent plus fine que la
    matrice (ex. apps.boutique : RH a un accès module large au catalogue, mais PAS à la liste de
    toutes les commandes, seuil réservé à Bureau Admin+ — voir CommandePermission). Si
    is_elevated_for_module se basait sur l'ensemble complet des rôles de l'utilisateur SANS
    exclure son rôle système actuel, un compte RH nu (sans aucune UserRoleAssignment
    supplémentaire) se retrouverait à tort "élevé" pour boutique — régression détectée par
    test_rh_ne_voit_pas_toutes_les_commandes (apps.boutique) lors de l'écriture des tests Phase B
    du 2026-09-23, corrigée ici. Cette fonction ne sert donc qu'à couvrir les rôles VRAIMENT
    additionnels : un rôle personnalisé (Vertrieb, Design, ...), ou un second rôle système
    obtenu via UserRoleAssignment (auquel cas UserRolesView recalcule de toute façon le rôle
    "primaire" vers le plus élevé des deux — voir views.py — donc ce cas ne se présente en
    pratique presque jamais après un passage par cette API)."""

from apps.accounts.models import Role

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
    """True dès qu'un rôle ADDITIONNEL de l'utilisateur (au-delà de son rôle système actuel,
    `user.role`) accorde au moins la lecture sur ce module — voir docstring de module pour le
    raisonnement complet. Utilisé en Phase B par les `permissions.py` bespoke des apps métier
    pour décider "toutes les données" vs "seulement les miennes", en plus (jamais à la place) de
    leur logique ROLE_LEVELS existante."""
    role_actuel = getattr(user, "role", None)
    autres_roles = get_user_role_slugs(user) - {role_actuel}
    if not autres_roles:
        return False
    return any(
        _NIVEAUX_ORDONNES[_niveau_acces_pour(slug, module)]
        >= _NIVEAUX_ORDONNES[NiveauAcces.LECTURE]
        for slug in autres_roles
    )


def get_admin_page_niveau(user, page_slug: str) -> str:
    """Niveau d'accès EFFECTIF de l'utilisateur sur UNE des 13 pages de gestion (Phase D, voir
    registry.PAGES_ADMIN) — extrait de has_admin_page_access le 2026-09-24 (task #215, retour
    utilisateur) pour que le frontend puisse exposer le niveau réel (`GET /rbac/mes-acces/`,
    MesAccesView) et pas seulement un booléen "a accès" : un booléen ne suffit plus à décider si
    les contrôles d'ÉCRITURE d'une page doivent être désactivés, depuis que `lecture` et
    `lecture_ecriture` ont un effet réellement différent (voir has_admin_page_access ci-dessous).

    Même raisonnement Administrateur App et `user_has_module_access` (union de tous les rôles
    effectifs, legacy CharField inclus) que has_admin_page_access — voir sa docstring, qui reste
    la référence complète pour le "pourquoi" de ce mécanisme."""
    if not user or not getattr(user, "is_authenticated", False):
        return NiveauAcces.AUCUN
    if user.role == Role.SUPER_ADMIN:
        return NiveauAcces.LECTURE_ECRITURE
    slugs = get_user_role_slugs(user)
    if not slugs:
        return NiveauAcces.AUCUN
    meilleur_rang = max(_NIVEAUX_ORDONNES[_niveau_acces_pour(s, page_slug)] for s in slugs)
    for niveau, rang in _NIVEAUX_ORDONNES.items():
        if rang == meilleur_rang:
            return niveau
    return NiveauAcces.AUCUN  # pragma: no cover — inatteignable, _NIVEAUX_ORDONNES est exhaustif


def has_admin_page_access(user, page_slug: str, required: str = NiveauAcces.LECTURE) -> bool:
    """Porte d'accès pour les 13 pages de gestion (Phase D, ajoutée le 2026-09-23, voir
    registry.PAGES_ADMIN) — DÉLIBÉRÉMENT différente de is_elevated_for_module : ici la matrice
    doit faire autorité pour le rôle système ACTUEL de l'utilisateur, pas seulement pour un rôle
    additionnel (c'est le sens même de la demande "Zugriff bei den Systemrollen auch umzustellen
    [...]"). On utilise donc `get_admin_page_niveau`, qui prend l'union de TOUS les rôles
    effectifs de l'utilisateur (`get_user_role_slugs`, legacy CharField inclus) — jamais
    `is_elevated_for_module`, qui exclut ce rôle actuel par construction (Phase B, un besoin
    différent : "toutes les données du module ou seulement les miennes").

    `required` (ajouté le 2026-09-24, retour utilisateur : un rôle avec seulement "Lesen" sur
    Quiz-Verwaltung pouvait quand même créer des quiz) — par défaut `NiveauAcces.LECTURE` : "a
    accès à la page" (utilisé pour le routing/la sidebar côté frontend et les actions de lecture
    côté backend, `lecture` ET `lecture_ecriture` suffisent). Passer explicitement
    `NiveauAcces.LECTURE_ECRITURE` aux points d'appel qui gardent une action de MODIFICATION
    (create/update/destroy et actions POST/PATCH assimilées) au sein d'une des 13 pages, pour
    qu'une cellule "Lesen" seule ne débloque plus que la consultation, jamais la gestion — voir
    chaque `permissions.py`/`views.py` bespoke des 13 sites pour le détail de la répartition
    lecture/écriture par action (elle n'est pas uniforme : certaines pages n'ont aucune notion
    d'écriture distincte, ex. `page_stats`, entièrement en lecture).

    Administrateur App (Super Admin) : accès total HARTCODÉ, jamais déterminé par la matrice,
    même si une ligne RoleModulePermission existe et vaut "aucun" — décision utilisateur
    confirmée ("Rollenverwaltung bleibt fest bei App-Administrator") étendue par prudence à
    l'ensemble des 13 pages : aucune combinaison de cellules ne doit pouvoir mettre l'App-Admin
    lui-même hors-jeu. Voir aussi RoleModuleMatrixSetView, qui empêche même d'écrire une telle
    ligne pour ce rôle — défense en profondeur, cette fonction resterait sûre de toute façon."""
    niveau = get_admin_page_niveau(user, page_slug)
    return _NIVEAUX_ORDONNES[niveau] >= _NIVEAUX_ORDONNES[required]

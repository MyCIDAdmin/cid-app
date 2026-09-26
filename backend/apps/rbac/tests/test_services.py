"""Tests services — app rbac : get_user_role_slugs, user_has_module_access (union multi-rôle),
is_elevated_for_module."""

import pytest
from django.contrib.auth.models import AnonymousUser

from apps.accounts.models import Role
from apps.rbac.models import NiveauAcces
from apps.rbac.services import (
    get_admin_page_niveau,
    get_user_role_slugs,
    has_admin_page_access,
    is_elevated_for_module,
    user_has_module_access,
)
from apps.rbac.tests.factories import (
    RoleDefinitionFactory,
    RoleModulePermissionFactory,
    UserFactory,
    UserRoleAssignmentFactory,
)

pytestmark = pytest.mark.django_db


# --- get_user_role_slugs ---------------------------------------------------------------------


def test_get_user_role_slugs_anonyme_retourne_ensemble_vide():
    assert get_user_role_slugs(AnonymousUser()) == set()


def test_get_user_role_slugs_inclut_toujours_le_role_legacy():
    """Un compte jamais passé par la nouvelle UI (aucune UserRoleAssignment) continue de se
    comporter exactement comme avant ce module — le CharField `user.role` seul suffit."""
    user = UserFactory(role=Role.MEMBRE)
    assert get_user_role_slugs(user) == {"membre"}


def test_get_user_role_slugs_cumule_role_legacy_et_attributions():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="vertrieb")
    UserRoleAssignmentFactory(user=user, role=role_perso)
    assert get_user_role_slugs(user) == {"membre", "vertrieb"}


def test_get_user_role_slugs_ignore_les_roles_inactifs():
    user = UserFactory(role=Role.MEMBRE)
    role_inactif = RoleDefinitionFactory(slug="design", actif=False)
    UserRoleAssignmentFactory(user=user, role=role_inactif)
    assert get_user_role_slugs(user) == {"membre"}


# --- user_has_module_access -----------------------------------------------------------------


def test_user_has_module_access_sans_aucun_role_refuse():
    """Ne peut arriver qu'en théorie (le CharField legacy est toujours présent en pratique) —
    couvre néanmoins le chemin moindre-privilège explicite de la fonction."""
    assert user_has_module_access(AnonymousUser(), "membres", NiveauAcces.LECTURE) is False


def test_user_has_module_access_role_sans_ligne_matrice_vaut_aucun():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="design-sans-matrice")
    UserRoleAssignmentFactory(user=user, role=role_perso)
    # Aucune RoleModulePermission pour "design-sans-matrice" sur "stats" => défaut "aucun".
    assert user_has_module_access(user, "stats", NiveauAcces.LECTURE) is False


def test_user_has_module_access_semantique_union_le_plus_permissif_gagne():
    """Deux rôles du même user sur le même module : le plus permissif l'emporte, quel que soit
    l'ordre d'attribution."""
    user = UserFactory(role=Role.MEMBRE)
    role_lecture = RoleDefinitionFactory(slug="lecteur")
    role_ecriture = RoleDefinitionFactory(slug="editeur")
    RoleModulePermissionFactory(
        role=role_lecture, module="projets", niveau_acces=NiveauAcces.LECTURE
    )
    RoleModulePermissionFactory(
        role=role_ecriture, module="projets", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_lecture)
    UserRoleAssignmentFactory(user=user, role=role_ecriture)

    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE_ECRITURE) is True
    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE) is True


def test_user_has_module_access_lecture_seule_insuffisante_pour_ecriture():
    user = UserFactory(role=Role.MEMBRE)
    role_lecture = RoleDefinitionFactory(slug="lecteur-seul")
    RoleModulePermissionFactory(
        role=role_lecture, module="projets", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_lecture)

    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE) is True
    assert user_has_module_access(user, "projets", NiveauAcces.LECTURE_ECRITURE) is False


def test_user_has_module_access_role_legacy_membre_utilise_la_matrice_seedee():
    """Intégration avec la migration de données 0002 : le rôle système "membre" a été seedé avec
    lecture_ecriture sur "membres" et aucun accès sur "stats" (miroir des seuils déjà en vigueur
    dans apps/membres et apps/stats) — vérifie que le seed est bien exploité par la fonction."""
    user = UserFactory(role=Role.MEMBRE)
    assert user_has_module_access(user, "membres", NiveauAcces.LECTURE_ECRITURE) is True
    assert user_has_module_access(user, "stats", NiveauAcces.LECTURE) is False


# --- is_elevated_for_module ------------------------------------------------------------------


def test_is_elevated_for_module_faux_pour_membre_seul():
    user = UserFactory(role=Role.MEMBRE)
    assert is_elevated_for_module(user, "membres") is False


def test_is_elevated_for_module_vrai_des_quun_role_non_membre_donne_la_lecture():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="vertrieb-elevated")
    RoleModulePermissionFactory(role=role_perso, module="membres", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert is_elevated_for_module(user, "membres") is True


def test_is_elevated_for_module_faux_si_le_role_non_membre_na_aucun_acces_sur_ce_module():
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="design-elevated")
    RoleModulePermissionFactory(role=role_perso, module="membres", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    # Le rôle "design-elevated" n'a aucune ligne pour "cotisations" => défaut "aucun".
    assert is_elevated_for_module(user, "cotisations") is False


def test_is_elevated_for_module_ignore_le_role_membre_meme_avec_acces_matrice():
    """Le rôle système actuel de l'utilisateur ("membre" ici) est explicitement exclu de la
    question "élevé ou non", quel que soit son propre niveau d'accès dans la matrice (il a
    lecture_ecriture sur "membres" via le seed, mais ça ne doit jamais suffire à rendre un
    membre "élevé")."""
    user = UserFactory(role=Role.MEMBRE)
    assert is_elevated_for_module(user, "membres") is False


def test_is_elevated_for_module_ignore_aussi_le_role_systeme_actuel_non_membre():
    """Même principe que ci-dessus, mais pour un rôle système AUTRE que "membre" : un compte RH
    nu (aucune UserRoleAssignment supplémentaire) n'est jamais "élevé" par son propre rôle, même
    si le seed lui donne un accès large à un module dans la matrice — ce rôle a déjà sa propre
    logique ROLE_LEVELS ailleurs dans le code (souvent plus fine, voir docstring de module :
    apps.boutique.CommandePermission réserve la liste de toutes les commandes à Bureau Admin+,
    pas à RH, alors même que RH a lecture_ecriture sur "boutique" dans la matrice seedée)."""
    user = UserFactory(role=Role.RH)
    assert is_elevated_for_module(user, "boutique") is False


def test_is_elevated_for_module_vrai_pour_un_role_systeme_avec_un_role_additionnel():
    """Un compte RH devient bien "élevé" dès qu'un rôle VRAIMENT additionnel (personnalisé, ici)
    lui donne un accès sur le module — seul son propre rôle système actuel est exclu."""
    user = UserFactory(role=Role.RH)
    role_perso = RoleDefinitionFactory(slug="vertrieb-plus-rh")
    RoleModulePermissionFactory(
        role=role_perso, module="boutique", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert is_elevated_for_module(user, "boutique") is True


# --- has_admin_page_access (Phase D, ajoutée le 2026-09-23) ----------------------------------
#
# Contrairement à is_elevated_for_module ci-dessus, cette fonction NE doit PAS exclure le rôle
# système actuel de l'utilisateur — c'est justement le point de la Phase D : la matrice doit
# faire autorité pour les rôles système eux-mêmes sur les 13 pages de gestion.


def test_has_admin_page_access_anonyme_refuse():
    assert has_admin_page_access(AnonymousUser(), "page_quiz") is False


def test_has_admin_page_access_super_admin_toujours_vrai_meme_sans_ligne_matrice():
    """Accès hartcodé — vrai même si la migration de seed n'a (par hypothèse) rien écrit pour ce
    slug, contrairement à toutes les autres fonctions de ce module qui appliquent le défaut
    "aucun" en l'absence de ligne."""
    admin = UserFactory(role=Role.SUPER_ADMIN)
    assert has_admin_page_access(admin, "page_quiz") is True
    assert has_admin_page_access(admin, "un-slug-totalement-inconnu") is True


def _set_matrice_cellule(role, module_slug, niveau_acces):
    """Les 5 rôles système + les 13 pages admin ont déjà une ligne seedée par la migration 0003
    — on met donc toujours à jour via update_or_create, jamais via la factory (qui créerait un
    doublon de slug sur la contrainte unique_together)."""
    from apps.rbac.models import RoleModulePermission

    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_has_admin_page_access_super_admin_toujours_vrai_meme_si_matrice_dit_aucun():
    """Défense en profondeur : même si une ligne "aucun" existe explicitement pour super_admin
    (ne devrait normalement jamais arriver, voir la garde côté RoleModuleMatrixSetView), le
    bypass hartcodé reste prioritaire. Les 5 rôles système existent déjà (seed 0002) — on les
    récupère via .get(), jamais via la factory (qui créerait un doublon de slug)."""
    from apps.rbac.models import RoleDefinition

    admin = UserFactory(role=Role.SUPER_ADMIN)
    role_super_admin = RoleDefinition.objects.get(slug=Role.SUPER_ADMIN, is_system=True)
    _set_matrice_cellule(role_super_admin, "page_quiz", NiveauAcces.AUCUN)
    assert has_admin_page_access(admin, "page_quiz") is True


def test_has_admin_page_access_role_systeme_suit_la_matrice_directement():
    """Le coeur de la Phase D : contrairement à is_elevated_for_module, le rôle système ACTUEL
    de l'utilisateur (pas seulement un rôle additionnel) détermine directement le résultat. Le
    seed de migration 0003 donne déjà lecture_ecriture à Bureau Admin sur page_quiz (miroir de
    MODERATION_MIN_LEVEL) — ce test part donc d'un "aucun" explicite pour vérifier les deux sens
    plutôt que de supposer une absence de ligne."""
    from apps.rbac.models import RoleDefinition

    role_bureau_admin = RoleDefinition.objects.get(slug=Role.BUREAU_ADMIN, is_system=True)
    user = UserFactory(role=Role.BUREAU_ADMIN)

    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.AUCUN)
    assert has_admin_page_access(user, "page_quiz") is False

    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.LECTURE_ECRITURE)
    assert has_admin_page_access(user, "page_quiz") is True


def test_has_admin_page_access_restriction_reelle_dun_role_systeme():
    """Nouveau par rapport à Phase B : une cellule peut désormais RETIRER un accès à un rôle
    système, pas seulement en ajouter un — ici Bureau Admin, qui a lecture_ecriture par défaut
    sur page_quiz depuis le seed de migration 0003 (miroir de MODERATION_MIN_LEVEL)."""
    from apps.rbac.models import RoleDefinition

    role_bureau_admin = RoleDefinition.objects.get(slug=Role.BUREAU_ADMIN, is_system=True)
    user = UserFactory(role=Role.BUREAU_ADMIN)
    assert has_admin_page_access(user, "page_quiz") is True  # valeur seedée par défaut

    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.AUCUN)
    assert has_admin_page_access(user, "page_quiz") is False


def test_has_admin_page_access_lecture_seule_suffit_pour_le_niveau_par_defaut():
    """Par défaut (`required=NiveauAcces.LECTURE`, "a accès à la page" au sens large), "lecture"
    seule suffit — c'est le sens de required=LECTURE_ECRITURE ci-dessous qui distingue désormais
    réellement les deux niveaux (voir docstring de la fonction et test suivant)."""
    from apps.rbac.models import RoleDefinition

    role_bureau_admin = RoleDefinition.objects.get(slug=Role.BUREAU_ADMIN, is_system=True)
    user = UserFactory(role=Role.BUREAU_ADMIN)
    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.LECTURE)
    assert has_admin_page_access(user, "page_quiz") is True


def test_has_admin_page_access_lecture_seule_insuffisante_pour_lecture_ecriture_requise():
    """Le coeur du fix du 2026-09-24 (retour utilisateur, bug Quiz/Finanzdirektor) : une cellule
    `lecture` ne doit PLUS satisfaire un appel qui exige explicitement `lecture_ecriture`."""
    from apps.rbac.models import RoleDefinition

    role_dir_financier = RoleDefinition.objects.get(slug=Role.DIR_FINANCIER, is_system=True)
    user = UserFactory(role=Role.DIR_FINANCIER)
    _set_matrice_cellule(role_dir_financier, "page_quiz", NiveauAcces.LECTURE)

    assert has_admin_page_access(user, "page_quiz", required=NiveauAcces.LECTURE) is True
    assert has_admin_page_access(user, "page_quiz", required=NiveauAcces.LECTURE_ECRITURE) is False

    _set_matrice_cellule(role_dir_financier, "page_quiz", NiveauAcces.LECTURE_ECRITURE)
    assert has_admin_page_access(user, "page_quiz", required=NiveauAcces.LECTURE_ECRITURE) is True


def test_has_admin_page_access_role_additionnel_personnalise_peut_octroyer_lacces():
    """Un rôle personnalisé additionnel avec accès sur une page de gestion suffit, même si le
    rôle système actuel de l'utilisateur n'a lui-même aucun accès (union de tous les rôles,
    comme user_has_module_access)."""
    user = UserFactory(role=Role.MEMBRE)
    role_perso = RoleDefinitionFactory(slug="quiz-master")
    RoleModulePermissionFactory(
        role=role_perso, module="page_quiz", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert has_admin_page_access(user, "page_quiz") is True


# --- get_admin_page_niveau (extrait de has_admin_page_access le 2026-09-24, task #215) --------


def test_get_admin_page_niveau_anonyme_vaut_aucun():
    assert get_admin_page_niveau(AnonymousUser(), "page_quiz") == NiveauAcces.AUCUN


def test_get_admin_page_niveau_super_admin_toujours_lecture_ecriture():
    from apps.rbac.models import RoleDefinition

    role_super_admin = RoleDefinition.objects.get(slug=Role.SUPER_ADMIN, is_system=True)
    admin = UserFactory(role=Role.SUPER_ADMIN)
    _set_matrice_cellule(role_super_admin, "page_quiz", NiveauAcces.AUCUN)
    assert get_admin_page_niveau(admin, "page_quiz") == NiveauAcces.LECTURE_ECRITURE


def test_get_admin_page_niveau_reflete_exactement_la_cellule_matrice():
    from apps.rbac.models import RoleDefinition

    role_bureau_admin = RoleDefinition.objects.get(slug=Role.BUREAU_ADMIN, is_system=True)
    user = UserFactory(role=Role.BUREAU_ADMIN)

    assert get_admin_page_niveau(user, "page_quiz") == NiveauAcces.LECTURE_ECRITURE  # seedé

    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.LECTURE)
    assert get_admin_page_niveau(user, "page_quiz") == NiveauAcces.LECTURE

    _set_matrice_cellule(role_bureau_admin, "page_quiz", NiveauAcces.AUCUN)
    assert get_admin_page_niveau(user, "page_quiz") == NiveauAcces.AUCUN


def test_get_admin_page_niveau_union_le_plus_permissif_gagne():
    """Même sémantique d'union que user_has_module_access : le meilleur niveau parmi tous les
    rôles effectifs de l'utilisateur l'emporte."""
    from apps.rbac.models import RoleDefinition

    user = UserFactory(role=Role.MEMBRE)
    role_membre = RoleDefinition.objects.get(slug=Role.MEMBRE, is_system=True)
    _set_matrice_cellule(role_membre, "page_quiz", NiveauAcces.LECTURE)

    role_perso = RoleDefinitionFactory(slug="quiz-master-niveau")
    RoleModulePermissionFactory(
        role=role_perso, module="page_quiz", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    assert get_admin_page_niveau(user, "page_quiz") == NiveauAcces.LECTURE_ECRITURE

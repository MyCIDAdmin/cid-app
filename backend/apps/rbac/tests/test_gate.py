"""Tests — barrière "non-membre" (apps.rbac.authentication, 2026-10-11).

Demande utilisateur : "Es soll garantiert werden, dass ein User, der in der neuen Kampagne nicht
mehr angemeldet ist, NUR die Module sieht, die ein Nicht-Mitglied sehen darf" — et : "Ich habe
einen User als nicht Mitglied markiert, trotzdem darf er immer noch Community-Module sehen."

IMPORTANT : ces tests s'authentifient par un VRAI jeton JWT (`Authorization: Bearer ...`), pas par
`force_authenticate` — ce dernier contourne entièrement les classes d'authentification, donc la
barrière (qui vit dans GatedJWTAuthentication) n'y serait jamais exercée."""

import pytest
from django.apps import apps as django_apps
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Role
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.rbac import services
from apps.rbac.models import ModuleVisibiliteMembre, NiveauAcces, RoleDefinition
from apps.rbac.registry import (
    API_PREFIXES_MENU,
    MENU_GROUPE,
    MENU_KEYS,
    MENU_MODULE_MATRICE,
    MODULES,
    PAGES_ADMIN,
    VISIBILITE_NON_MEMBRE_DEFAUT,
)
from apps.rbac.tests.factories import (
    RoleDefinitionFactory,
    RoleModulePermissionFactory,
    UserFactory,
    UserRoleAssignmentFactory,
)

pytestmark = pytest.mark.django_db

FIL = "/api/v1/communaute/publications/"
FORUM = "/api/v1/communaute/sujets/"
EVENEMENTS = "/api/v1/evenements/evenements/"
CLASSEMENT = "/api/v1/communaute/classement/"
NOTIFICATIONS = "/api/v1/notifications/"


def _client(user):
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


def _compte(statut=StatutMembre.ACTIF, role=Role.MEMBRE, avec_fiche=True):
    user = UserFactory(role=role)
    if avec_fiche:
        MembreFactory(user=user, statut=statut)
    return user


def _cocher_non_membre(cle, visible=True):
    ModuleVisibiliteMembre.objects.update_or_create(
        module=cle, defaults={"visible_non_membre": visible}
    )


# --- la garantie centrale -------------------------------------------------------------------


@pytest.mark.parametrize("statut", [StatutMembre.EN_ATTENTE, StatutMembre.INACTIF])
def test_non_membre_n_atteint_pas_le_fil(statut):
    """Neuer User (en attente) ET ancien membre (inactif) : même résultat."""
    resp = _client(_compte(statut)).get(FIL)
    assert resp.status_code == 403
    assert resp.data["code"] == "module_non_disponible"


def test_compte_sans_fiche_membre_n_atteint_pas_le_fil():
    assert _client(_compte(avec_fiche=False)).get(FIL).status_code == 403


def test_membre_actif_atteint_le_fil():
    assert _client(_compte(StatutMembre.ACTIF)).get(FIL).status_code == 200


def test_passage_actif_vers_inactif_ferme_l_acces_immediatement():
    """Cas du retour utilisateur : on marque un compte comme non-membre, l'accès se ferme sans
    nouvelle connexion (le statut est lu en base à chaque requête, pas dans le jeton)."""
    user = _compte(StatutMembre.ACTIF)
    client = _client(user)
    assert client.get(FIL).status_code == 200

    user.membre.statut = StatutMembre.INACTIF
    user.membre.save()

    assert client.get(FIL).status_code == 403


def test_non_membre_atteint_les_modules_coches_par_defaut():
    assert _client(_compte(StatutMembre.INACTIF)).get(EVENEMENTS).status_code == 200


def test_cocher_la_colonne_non_membre_ouvre_exactement_ce_module():
    user = _compte(StatutMembre.INACTIF)
    client = _client(user)
    _cocher_non_membre("forum")

    assert client.get(FORUM).status_code == 200
    # Chaque entrée se règle seule : cocher "forum" n'ouvre pas "fil".
    assert client.get(FIL).status_code == 403


def test_decocher_un_module_par_defaut_le_ferme_pour_les_non_membres():
    _cocher_non_membre("evenements", visible=False)
    assert _client(_compte(StatutMembre.INACTIF)).get(EVENEMENTS).status_code == 403
    # ... mais pas pour un membre actif (la colonne "membre" ne gère que le menu).
    assert _client(_compte(StatutMembre.ACTIF)).get(EVENEMENTS).status_code == 200


def test_lectures_publiques_de_la_startseite_restent_ouvertes_au_non_membre():
    user = _compte(StatutMembre.INACTIF)
    assert _client(user).get(CLASSEMENT).status_code == 200


def test_chemins_hors_barriere_restent_ouverts_au_non_membre():
    user = _compte(StatutMembre.INACTIF)
    assert _client(user).get(NOTIFICATIONS).status_code == 200
    assert _client(user).get(reverse("rbac:visibilite-membre-effective")).status_code == 200


def test_role_superieur_sans_fiche_membre_n_est_jamais_barre():
    assert _client(_compte(role=Role.BUREAU_ADMIN, avec_fiche=False)).get(FIL).status_code == 200


# --- plancher "Membre Normal" (question 1.1) et rôles de fonction --------------------------


def test_le_plancher_membre_normal_n_ouvre_rien_a_un_non_membre():
    """L'attribution "Membre Normal" (toujours cochée, jamais retirable) ne confère AUCUN accès
    de membre à un compte inactif : seul le statut de la fiche compte."""
    user = _compte(StatutMembre.INACTIF)
    role_membre = RoleDefinition.objects.get(slug=Role.MEMBRE)
    UserRoleAssignmentFactory(user=user, role=role_membre)
    assert _client(user).get(FIL).status_code == 403


def _role_tout_ouvert():
    """Reproduit le rôle personnalisé "Nicht Mitglieder" de la production (retour du 2026-10-11) :
    "Lecture & écriture" sur tous les modules ET toutes les pages de gestion."""
    role = RoleDefinitionFactory()
    for module in (*MODULES, *PAGES_ADMIN):
        RoleModulePermissionFactory(
            role=role, module=module, niveau_acces=NiveauAcces.LECTURE_ECRITURE
        )
    return role


def test_un_role_personnalise_additionnel_n_ouvre_aucun_module_a_un_non_membre():
    user = _compte(StatutMembre.INACTIF)
    UserRoleAssignmentFactory(user=user, role=_role_tout_ouvert())
    client = _client(user)
    assert client.get(FIL).status_code == 403
    assert services.acces_cle_menu(user, "quiz") is False
    assert services.acces_cle_menu(user, "vote") is False


def test_un_acces_a_une_page_de_gestion_n_ouvre_pas_le_module_a_un_non_membre():
    user = _compte(StatutMembre.INACTIF)
    role = RoleDefinitionFactory()
    RoleModulePermissionFactory(role=role, module="page_quiz", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role)
    assert services.acces_cle_menu(user, "quiz") is False


def test_la_colonne_non_membre_reste_la_seule_source_meme_avec_un_role_additionnel():
    user = _compte(StatutMembre.INACTIF)
    UserRoleAssignmentFactory(user=user, role=_role_tout_ouvert())
    ModuleVisibiliteMembre.objects.update_or_create(
        module="forum", defaults={"visible": True, "visible_non_membre": True}
    )
    client = _client(user)
    assert client.get(FORUM).status_code == 200
    assert client.get(FIL).status_code == 403


# --- visibilité effective (menu + routes frontend) -----------------------------------------


def test_visibilite_effective_non_membre_ne_montre_que_les_modules_coches():
    user = _compte(StatutMembre.EN_ATTENTE)
    effectif = services.visibilite_effective(user)
    assert {cle for cle, visible in effectif.items() if visible} == VISIBILITE_NON_MEMBRE_DEFAUT


def test_visibilite_effective_non_membre_ignore_les_roles_additionnels():
    user = _compte(StatutMembre.INACTIF)
    UserRoleAssignmentFactory(user=user, role=_role_tout_ouvert())
    effectif = services.visibilite_effective(user)
    assert {cle for cle, visible in effectif.items() if visible} == VISIBILITE_NON_MEMBRE_DEFAUT


# --- registre / cohérence --------------------------------------------------------------------


def test_chaque_entree_de_menu_est_individuelle_et_complete():
    for cle in ("fil", "forum", "messagerie", "groupes", "live", "quiz", "albums", "covoiturage"):
        assert cle in MENU_KEYS
    assert "communaute" not in MENU_KEYS  # l'ancienne clé groupée n'est plus réglable
    assert all(MENU_MODULE_MATRICE[cle] in MODULES for cle in MENU_KEYS)
    assert set(MENU_GROUPE.values()) == {"general", "communaute", "contenu"}


def test_chaque_prefixe_d_api_pointe_vers_une_cle_de_menu_connue():
    assert all(cle in MENU_KEYS for _prefixe, cle in API_PREFIXES_MENU)
    # Toute entrée de menu à données propres est barrée côté API (sauf "membres", déjà scopé
    # à soi-même sous le rôle RH).
    assert set(MENU_KEYS) - {cle for _p, cle in API_PREFIXES_MENU} == {"membres"}


def test_les_pages_admin_liees_existent():
    from apps.rbac.registry import MENU_PAGES_ADMIN

    assert all(page in PAGES_ADMIN for pages in MENU_PAGES_ADMIN.values() for page in pages)


def test_le_prefixe_le_plus_long_gagne_pour_le_covoiturage():
    assert services.cle_menu_pour_chemin("/api/v1/evenements/covoiturages/") == "covoiturage"
    assert services.cle_menu_pour_chemin("/api/v1/evenements/evenements/") == "evenements"
    assert services.cle_menu_pour_chemin("/api/v1/auth/me/") is None
    assert services.cle_menu_pour_chemin("/api/v1/communaute/classement/") is None


def test_lignes_de_visibilite_exposent_le_groupe_du_menu():
    lignes = {ligne["module"]: ligne for ligne in services.visibilite_lignes()}
    assert lignes["forum"]["menu_groupe"] == "communaute"
    assert lignes["boutique"]["menu_groupe"] == "general"
    assert lignes["quiz"]["menu_groupe"] == "contenu"


# --- migration de données 0006 ----------------------------------------------------------------


def test_migration_0006_les_nouvelles_cles_heritent_de_l_ancienne_cle_groupee():
    from importlib import import_module

    migration = import_module("apps.rbac.migrations.0006_visibilite_par_entree_de_menu")
    ModuleVisibiliteMembre.objects.filter(module__in=["fil", "forum", "covoiturage"]).delete()
    ModuleVisibiliteMembre.objects.update_or_create(
        module="communaute", defaults={"visible": False, "visible_non_membre": True}
    )
    ModuleVisibiliteMembre.objects.update_or_create(
        module="evenements", defaults={"visible": True, "visible_non_membre": False}
    )

    migration.heriter(django_apps, None)

    fil = ModuleVisibiliteMembre.objects.get(module="fil")
    assert (fil.visible, fil.visible_non_membre) == (False, True)
    covoiturage = ModuleVisibiliteMembre.objects.get(module="covoiturage")
    assert (covoiturage.visible, covoiturage.visible_non_membre) == (True, False)

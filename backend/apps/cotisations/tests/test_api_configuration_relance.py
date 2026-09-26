"""
Tests API — ConfigurationRelanceViewSet (AHM-54, suite retour utilisateur sur AHM-18).

Même niveau de permission que marquer_payee (Directeur Financier/Admin) — voir
apps.cotisations.tests.test_api pour les tests équivalents sur /cotisations/{id}/marquer-payee/.
"""

from datetime import date

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ConfigurationRelance
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

LIST_URL = "cotisations:configuration-relance-list"


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _detail_url(config):
    return reverse("cotisations:configuration-relance-detail", args=[config.id])


# --- Permissions ---


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 401


def test_membre_ne_peut_pas_lister(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 403


def test_rh_ne_peut_pas_lister(api_client):
    # Le RH garde un accès en lecture seule sur /cotisations/ mais pas sur ce paramétrage —
    # même choix que marquer_payee (SAISIE_POUR_AUTRUI_MIN_LEVEL = Directeur Financier).
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 403


def test_directeur_financier_peut_lister(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 200
    assert resp.data["results"][0]["annee"] == 2027


def test_admin_peut_lister(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 200


# --- Création / modification ---


def test_directeur_financier_peut_creer_une_echeance(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 201, resp.data
    assert resp.data["annee"] == 2027
    assert resp.data["date_echeance"] == "2027-03-15"
    # modifie_par est résolu côté serveur (l'utilisateur courant), jamais transmis par le client.
    config = ConfigurationRelance.objects.get()
    assert config.modifie_par == membre


def test_membre_ne_peut_pas_creer_une_echeance(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 403
    assert ConfigurationRelance.objects.count() == 0


def test_creation_refusee_si_annee_deja_configuree(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2027, "date_echeance": "2027-03-15"})

    assert resp.status_code == 400


def test_directeur_financier_peut_modifier_une_echeance(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(config), {"date_echeance": "2027-04-01"})

    assert resp.status_code == 200, resp.data
    config.refresh_from_db()
    assert config.date_echeance == date(2027, 4, 1)
    assert config.modifie_par == membre


def test_membre_ne_peut_pas_modifier_une_echeance(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(config), {"date_echeance": "2027-04-01"})

    assert resp.status_code == 403
    config.refresh_from_db()
    assert config.date_echeance == date(2027, 1, 1)


def test_directeur_financier_peut_supprimer_une_echeance(api_client):
    # Revenir au comportement par défaut (1er janvier) pour une année donnée.
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    config = ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 3, 15))
    _auth(api_client, user)

    resp = api_client.delete(_detail_url(config))

    assert resp.status_code == 204
    assert ConfigurationRelance.objects.count() == 0


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Fälligkeitstermine"
# (page_cotisations_relances) désormais pilotée par apps.rbac (real enforcement, y compris pour
# les rôles système eux-mêmes).
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_directeur_financier_perd_lacces_aux_relances_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("dir_financier", "page_cotisations_relances", NiveauAcces.AUCUN)
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "phased-relances-restrict@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2028, "date_echeance": "2028-01-01"})
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_gerer_les_relances_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _membre = _user_avec_membre(Role.MEMBRE, "phased-relances-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="relances-manager")
    RoleModulePermissionFactory(
        role=role_perso,
        module="page_cotisations_relances",
        niveau_acces=NiveauAcces.LECTURE_ECRITURE,
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2028, "date_echeance": "2028-01-01"})
    assert resp.status_code == 201, resp.data


def test_phase_d_super_admin_gere_toujours_les_relances_meme_si_matrice_dit_aucun(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_cotisations_relances", NiveauAcces.AUCUN)
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "phased-relances-super@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2028, "date_echeance": "2028-01-01"})
    assert resp.status_code == 201, resp.data


# ---------------------------------------------------------------------------
# Lecture vs écriture (ajouté le 2026-09-24, task #214, retour utilisateur sur Quiz-Verwaltung —
# voir apps.rbac.services.has_admin_page_access) : ConfigurationRelancePermission distingue GET
# (SAFE_METHODS, `lecture` suffit) de POST/PATCH/DELETE (`lecture_ecriture` requis) — voir
# apps.cotisations.views.ConfigurationRelancePermission.
# ---------------------------------------------------------------------------


def test_role_lecture_seule_peut_lister_mais_pas_creer_une_echeance(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    ConfigurationRelance.objects.create(annee=2027, date_echeance=date(2027, 1, 1))
    user, _membre = _user_avec_membre(Role.MEMBRE, "readonly-relances@example.de")
    role_perso = RoleDefinitionFactory(slug="relances-lecteur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_cotisations_relances", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp_list = api_client.get(reverse(LIST_URL))
    assert resp_list.status_code == 200
    assert resp_list.data["results"][0]["annee"] == 2027

    resp_create = api_client.post(reverse(LIST_URL), {"annee": 2028, "date_echeance": "2028-01-01"})
    assert resp_create.status_code == 403


def test_role_lecture_ecriture_peut_creer_une_echeance(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _membre = _user_avec_membre(Role.MEMBRE, "readwrite-relances@example.de")
    role_perso = RoleDefinitionFactory(slug="relances-editeur")
    RoleModulePermissionFactory(
        role=role_perso,
        module="page_cotisations_relances",
        niveau_acces=NiveauAcces.LECTURE_ECRITURE,
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"annee": 2028, "date_echeance": "2028-01-01"})
    assert resp.status_code == 201, resp.data

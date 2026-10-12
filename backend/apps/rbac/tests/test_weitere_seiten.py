"""Release 2b (2026-10-12): 5 weitere Verwaltungsseiten in der Matrix der Rollenverwaltung —
Startwerte entsprechen dem bisherigen Verhalten, Änderungen der Matrix wirken sofort."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.rbac.models import RoleDefinition, RoleModulePermission
from apps.rbac.registry import ALL_MODULES, PAGES_ADMIN

pytestmark = pytest.mark.django_db

NEUE_SEITEN = [
    "page_partner",
    "page_membres_import",
    "page_membres_zuordnung",
    "page_configuration_site",
    "page_fan_club_logos",
]


def _client(role):
    user = User.objects.create_user(
        email=f"{role}-seite@example.de", password="Password123!", role=role, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_neue_seiten_sind_in_der_registry():
    for seite in NEUE_SEITEN:
        assert seite in PAGES_ADMIN
        assert seite in ALL_MODULES


def test_matrix_liefert_neue_seiten_als_spalten():
    resp = _client(Role.SUPER_ADMIN).get(reverse("rbac:matrix"))
    assert resp.status_code == 200
    slugs = {m["slug"]: m["categorie"] for m in resp.data["modules"]}
    for seite in NEUE_SEITEN:
        assert slugs[seite] == "page_admin"


def test_startwerte_entsprechen_dem_bisherigen_verhalten():
    def niveau(rolle, seite):
        return RoleModulePermission.objects.get(
            role=RoleDefinition.objects.get(slug=rolle, is_system=True), module=seite
        ).niveau_acces

    assert niveau("rh", "page_membres_import") == "lecture_ecriture"
    assert niveau("rh", "page_partner") == "lecture"
    assert niveau("bureau_admin", "page_partner") == "lecture_ecriture"
    assert niveau("rh", "page_fan_club_logos") == "aucun"
    assert niveau("bureau_admin", "page_configuration_site") == "lecture_ecriture"


def test_rh_darf_import_vorlage_laden_solange_die_matrix_es_erlaubt():
    url = reverse("membres:membre-import-template")
    client = _client(Role.RH)
    assert client.get(url).status_code == 200

    RoleModulePermission.objects.filter(
        role__slug="rh", role__is_system=True, module="page_membres_import"
    ).update(niveau_acces="aucun")
    assert client.get(url).status_code == 403


def test_rh_nur_lesen_auf_import_darf_nicht_pruefen():
    RoleModulePermission.objects.filter(
        role__slug="rh", role__is_system=True, module="page_membres_import"
    ).update(niveau_acces="lecture")
    client = _client(Role.RH)
    assert client.get(reverse("membres:membre-import-template")).status_code == 200
    resp = client.post(reverse("membres:membre-import-pruefen"), {}, format="multipart")
    assert resp.status_code == 403


def test_mes_acces_enthaelt_neue_seiten():
    resp = _client(Role.BUREAU_ADMIN).get(reverse("rbac:mes-acces"))
    assert resp.status_code == 200
    for seite in NEUE_SEITEN:
        assert seite in resp.data

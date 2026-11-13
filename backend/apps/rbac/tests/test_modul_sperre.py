"""Tests — Modul-Sperre "Lesen = ansehen, Schreiben = mitmachen" (Rechte-Umbau, Nov. 2026).

Ein Architekturtest (Ratsche) sorgt dafür, dass neue Mitmach-Endpunkte nicht ohne Modul-Sperre
entstehen ; Verhaltenstests prüfen die drei Stufen und die Verwalter-Ausnahme."""

import importlib
import inspect

import pytest
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import Role
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.rbac import registry
from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission
from apps.rbac.permissions import ModuleAccessPermission, module_access_permission
from apps.rbac.tests.factories import RoleDefinitionFactory, UserFactory, UserRoleAssignmentFactory

pytestmark = pytest.mark.django_db

GATED_APPS = (
    "membres",
    "cotisations",
    "adhesions",
    "evenements",
    "boutique",
    "vote",
    "wahlen",
    "communaute",
    "projets",
)

# Bewusst OHNE Modul-Sperre : reine Verwaltungsansichten (haben eine eigene Seiten-Sperre),
# öffentliche Lesezugriffe oder Ansichten, die ein eigenes Gate haben. Neue Einträge brauchen
# eine Begründung ; die Liste darf nur kleiner werden.
AUSNAHMEN = {
    "cotisations.ArticleCatalogueViewSet": "Seite page_articles_cotisation",
    "cotisations.ConfigurationRelanceViewSet": "Seite page_cotisations_relances",
    "adhesions.MeineKarteView": "eigene Mitgliedskarte, nur eigene Daten",
    "communaute.ArrierePlanModuleViewSet": "Konfiguration (Seite / Bureau Admin)",
    "communaute.ChoixQuestionViewSet": "Seite page_quiz",
    "communaute.QuestionQuizViewSet": "Seite page_quiz",
    "communaute.EquipeLogoViewSet": "Seite page_fan_club_logos",
    "communaute.ConfigurationSitePublicView": "Seite page_configuration_site, Startseite",
    "communaute.ClassementLigueViewSet": "öffentliche Tabelle",
    "communaute.SpielplanIcsView": "öffentlicher Kalender-Feed",
}


def _ungesperrte_views():
    gefunden = set()
    for app in GATED_APPS:
        modul = importlib.import_module(f"apps.{app}.views")
        for name, klasse in inspect.getmembers(modul, inspect.isclass):
            if not issubclass(klasse, APIView) or klasse.__module__ != modul.__name__:
                continue
            gesperrt = any(
                isinstance(p, type) and issubclass(p, ModuleAccessPermission)
                for p in klasse.permission_classes
            )
            if not gesperrt:
                gefunden.add(f"{app}.{name}")
    return gefunden


def test_jede_mitmach_view_hat_die_modul_sperre():
    neu = _ungesperrte_views() - set(AUSNAHMEN)
    assert not neu, f"Views ohne module_access_permission(...) und ohne Ausnahme: {sorted(neu)}"


def test_ausnahmeliste_enthaelt_keine_toten_eintraege():
    tot = set(AUSNAHMEN) - _ungesperrte_views()
    assert not tot, f"Ausnahmen, die inzwischen gesperrt sind oder nicht mehr existieren: {tot}"


def test_modul_seiten_verweisen_auf_bekannte_module_und_seiten():
    for modul, seiten in registry.MODUL_SEITEN.items():
        assert modul in registry.MODULES
        for seite in seiten:
            assert seite in registry.PAGES_ADMIN


# --- Stufen der Sperre ---------------------------------------------------------------------


def _anfrage(methode, user=None):
    request = getattr(APIRequestFactory(), methode)("/x/")
    if user is not None:
        request.user = user
    else:
        from django.contrib.auth.models import AnonymousUser

        request.user = AnonymousUser()
    return request


def _zelle(slug, modul, niveau):
    RoleModulePermission.objects.update_or_create(
        role=RoleDefinition.objects.get(slug=slug, is_system=True),
        module=modul,
        defaults={"niveau_acces": niveau},
    )


def test_lesen_erlaubt_ansehen_aber_nicht_mitmachen():
    _zelle("membre", "projets", NiveauAcces.LECTURE)
    user = UserFactory()
    sperre = module_access_permission("projets")()
    assert sperre.has_permission(_anfrage("get", user), None)
    assert not sperre.has_permission(_anfrage("post", user), None)


def test_schreiben_erlaubt_mitmachen():
    _zelle("membre", "projets", NiveauAcces.LECTURE_ECRITURE)
    sperre = module_access_permission("projets")()
    assert sperre.has_permission(_anfrage("post", UserFactory()), None)


def test_kein_zugriff_sperrt_auch_das_ansehen():
    _zelle("membre", "projets", NiveauAcces.AUCUN)
    sperre = module_access_permission("projets")()
    assert not sperre.has_permission(_anfrage("get", UserFactory()), None)


def test_anonymes_lesen_nur_wenn_die_view_es_erlaubt():
    assert module_access_permission("evenements", anonym_lesen=True)().has_permission(
        _anfrage("get"), None
    )
    assert not module_access_permission("evenements")().has_permission(_anfrage("get"), None)
    # Ändernde Anfragen brauchen immer ein Konto.
    assert not module_access_permission("evenements", anonym_lesen=True)().has_permission(
        _anfrage("post"), None
    )


def test_verwalter_passiert_die_sperre_ohne_eigene_modulzelle():
    """Wer eine Verwaltungsseite des Moduls hat, muss nicht zusätzlich 'mitmachen' dürfen."""
    _zelle("membre", "evenements", NiveauAcces.AUCUN)
    user = UserFactory()
    rolle = RoleDefinitionFactory()
    RoleModulePermission.objects.create(
        role=rolle, module="page_events", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=rolle)
    sperre = module_access_permission("evenements")()
    assert sperre.has_permission(_anfrage("post", user), None)


def test_seite_mit_nur_lesen_erlaubt_nur_ansehen_der_verwaltung():
    _zelle("membre", "evenements", NiveauAcces.AUCUN)
    user = UserFactory()
    rolle = RoleDefinitionFactory()
    RoleModulePermission.objects.create(
        role=rolle, module="page_events", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=rolle)
    sperre = module_access_permission("evenements")()
    assert sperre.has_permission(_anfrage("get", user), None)
    assert not sperre.has_permission(_anfrage("post", user), None)


# --- Ende-zu-Ende über die API ---------------------------------------------------------------


def _mitglied_client():
    user = UserFactory(role=Role.MEMBRE)
    MembreFactory(user=user, statut=StatutMembre.ACTIF)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}")
    return client


def test_forum_beitrag_braucht_schreiben_auf_community():
    client = _mitglied_client()
    _zelle("membre", "communaute", NiveauAcces.LECTURE)
    assert client.get("/api/v1/communaute/sujets/").status_code == 200
    assert client.post("/api/v1/communaute/sujets/", {}, format="json").status_code == 403

    _zelle("membre", "communaute", NiveauAcces.LECTURE_ECRITURE)
    # Mit Schreiben kommt die Anfrage bis zur Validierung der View (400), nicht mehr 403.
    assert client.post("/api/v1/communaute/sujets/", {}, format="json").status_code == 400


def test_seed_hebt_abstimmungen_und_projekte_fuer_systemrollen_auf_schreiben():
    for slug in ("membre", "rh", "bureau_admin", "dir_financier", "super_admin"):
        for modul in ("vote", "projets"):
            zelle = RoleModulePermission.objects.get(role__slug=slug, module=modul)
            assert zelle.niveau_acces == NiveauAcces.LECTURE_ECRITURE

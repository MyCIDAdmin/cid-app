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


# --- Etappe 3 : feste Rollenstufen sind jetzt Seiten der Matrix ------------------------------

ROLLEN = ["membre", "rh", "bureau_admin", "dir_financier", "super_admin"]
# Seite -> Rollen, die sie beim Deploy bekommen (= bisheriges Verhalten)
SEED_SEITEN = {
    "page_membres": ["rh", "bureau_admin", "dir_financier", "super_admin"],
    "page_membres_loeschen": ["bureau_admin", "dir_financier", "super_admin"],
    "page_beitraege_uebersicht": ["rh", "bureau_admin", "dir_financier", "super_admin"],
    "page_souscriptions": ["rh", "bureau_admin", "dir_financier", "super_admin"],
    "page_abstimmungen": ["bureau_admin", "super_admin"],
    "page_community": ["bureau_admin", "dir_financier", "super_admin"],
    "page_tippspiel": ["super_admin"],
    "page_zahlung_versand": ["dir_financier", "super_admin"],
    "page_erfassung_fuer_andere": ["dir_financier", "super_admin"],
}


@pytest.mark.parametrize("seite", sorted(SEED_SEITEN))
def test_neue_seiten_starten_mit_dem_bisherigen_verhalten(seite):
    assert seite in registry.PAGES_ADMIN
    for slug in ROLLEN:
        zelle = RoleModulePermission.objects.get(role__slug=slug, module=seite)
        erwartet = NiveauAcces.LECTURE_ECRITURE if slug in SEED_SEITEN[seite] else NiveauAcces.AUCUN
        assert zelle.niveau_acces == erwartet, (seite, slug)


def test_abstimmungen_verwalten_nicht_fuer_rh_und_finanzen_wie_bisher():
    from apps.wahlen.services import verwaltet

    for rolle, erwartet in (
        (Role.BUREAU_ADMIN, True),
        (Role.SUPER_ADMIN, True),
        (Role.RH, False),
        (Role.DIR_FINANCIER, False),
        (Role.MEMBRE, False),
    ):
        assert verwaltet(UserFactory(role=rolle)) is erwartet, rolle


def test_matrix_kann_abstimmungen_fuer_eine_weitere_rolle_oeffnen():
    """Ziel der Umstellung : was früher fest im Code stand, steuert jetzt die Matrix."""
    from apps.wahlen.services import verwaltet

    user = UserFactory(role=Role.MEMBRE)
    assert verwaltet(user) is False
    rolle = RoleDefinitionFactory()
    RoleModulePermission.objects.create(
        role=rolle, module="page_abstimmungen", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=rolle)
    assert verwaltet(user) is True


def test_keine_feste_rollenstufe_mehr_in_den_fachapps():
    """Architektur-Ratsche : ROLE_LEVELS-Vergleiche für Rechte sind nur noch dort erlaubt, wo
    es um Empfängerkreise (E-Mail/Benachrichtigung) oder Konto-Verwaltung geht."""
    import pathlib
    import re

    erlaubt = {
        "partenaires/tasks.py",
        "adhesions/mails.py",
        "adhesions/notifications.py",
        "boutique/notifications.py",
        "cotisations/notifications.py",
        "communaute/gemeinschaft.py",
        "stats/permissions.py",
    }
    wurzel = pathlib.Path(__file__).resolve().parents[2]
    muster = re.compile(
        r"ROLE_LEVELS\.get\([^)]*\)\s*(>=|<|>)"  # Vergleich im Code
        r"|^\s*[A-Z_]+_MIN_LEVEL\s*="  # Konstante definieren
        r"|import .*_MIN_LEVEL"  # Konstante importieren
        r"|^\s+[A-Z_]+_MIN_LEVEL,$"  # Konstante in Importliste
    )
    treffer = []
    for app in (
        "membres",
        "cotisations",
        "adhesions",
        "evenements",
        "boutique",
        "vote",
        "wahlen",
        "communaute",
        "projets",
    ):
        for datei in (wurzel / app).glob("*.py"):
            rel = f"{app}/{datei.name}"
            if rel in erlaubt:
                continue
            for nr, zeile in enumerate(datei.read_text().splitlines(), 1):
                if zeile.lstrip().startswith(("#", '"')):
                    continue
                if muster.search(zeile):
                    treffer.append(f"{rel}:{nr}: {zeile.strip()}")
    assert not treffer, "Feste Rollenstufe statt Matrix-Seite:\n" + "\n".join(treffer)


def test_mes_acces_liefert_auch_die_modul_niveaus():
    from django.urls import reverse

    _zelle("membre", "projets", NiveauAcces.LECTURE)
    _zelle("membre", "evenements", NiveauAcces.AUCUN)
    antwort = _mitglied_client().get(reverse("rbac:mes-acces"))
    assert antwort.status_code == 200
    assert antwort.data["projets"] == NiveauAcces.LECTURE
    assert antwort.data["evenements"] == NiveauAcces.AUCUN
    assert antwort.data["communaute"] == NiveauAcces.LECTURE_ECRITURE
    assert antwort.data["page_events"] == NiveauAcces.AUCUN

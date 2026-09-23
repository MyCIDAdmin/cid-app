"""
Tests API — ArticleCatalogueViewSet (retour utilisateur du 2026-09-17 : "Artikeln / Elemente bei
'Cotisation' müssen vom APP-Admin verwaltbar sein (Anlegen / Aktualisieren / Deaktivieren ...)").

Décisions actées avec l'utilisateur (AskUserQuestion) : ces articles s'ajoutent aux 4 types fixes
existants (jamais les remplacer) et leur gestion en écriture est réservée exclusivement à
l'Administrateur App (Role.SUPER_ADMIN) — voir apps.cotisations.permissions.
ArticleCataloguePermission. Pas de suppression exposée (voir test_pas_de_destroy_expose) : un
article se désactive (actif=False), jamais supprimé physiquement (on_delete=PROTECT sur
Cotisation.article_catalogue).

Important : la migration 0006 seed 2 lignes techniques `type_fixe` (cotisation/adhésion, montant
45.00/15.00, actif=True) à chaque exécution des migrations — donc présentes dans TOUTE base de
test dès le départ, y compris ici. Les tests ci-dessous filtrent donc explicitement sur
`type_fixe__isnull=True` (ou ignorent ces 2 lignes) plutôt que de supposer une table vide — voir
la section dédiée "Lignes techniques type_fixe" plus bas pour leur comportement propre.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ArticleCatalogue, TypeArticle
from apps.cotisations.tests.factories import ArticleCatalogueFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

LIST_URL = "cotisations:article-catalogue-list"
NB_LIGNES_TYPE_FIXE = 2  # cotisation + adhésion, seedées par la migration 0006


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


def _detail_url(article):
    return reverse("cotisations:article-catalogue-detail", args=[article.id])


# --- Lecture : ouverte à tout authentifié, scope actif=True sous Administrateur App ---


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 401


def test_membre_peut_lister_les_articles_actifs(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    ArticleCatalogueFactory(libelle="Écusson brodé", montant="8.00")
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    # +2 : les lignes techniques cotisation/adhésion (migration 0006), toujours actives par défaut.
    assert len(resp.data["results"]) == 1 + NB_LIGNES_TYPE_FIXE
    libelles = [a["libelle"] for a in resp.data["results"]]
    assert "Écusson brodé" in libelles


def test_membre_ne_voit_pas_les_articles_desactives(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    ArticleCatalogueFactory(libelle="Article désactivé", actif=False)
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    libelles = [a["libelle"] for a in resp.data["results"]]
    assert "Article désactivé" not in libelles
    # Ne restent que les 2 lignes techniques (toujours actives par défaut) — voir docstring.
    assert len(resp.data["results"]) == NB_LIGNES_TYPE_FIXE


def test_admin_voit_aussi_les_articles_desactives(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    ArticleCatalogueFactory(libelle="Article actif", actif=True)
    ArticleCatalogueFactory(libelle="Article désactivé", actif=False)
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2 + NB_LIGNES_TYPE_FIXE


# --- Écriture : réservée exclusivement à l'Administrateur App ---


def test_admin_peut_creer_un_article(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL), {"libelle": "Écusson brodé", "montant": "8.00"}, format="json"
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["libelle"] == "Écusson brodé"
    assert resp.data["montant"] == "8.00"
    # `actif` non transmis à la création : le défaut modèle (True) doit s'appliquer — vérifié en
    # format="json" (voir DRF BooleanField.get_value : les payloads multipart/form-data, traités
    # comme un formulaire HTML, retourneraient False par défaut au lieu d'omettre le champ).
    assert resp.data["actif"] is True


def test_membre_ne_peut_pas_creer_un_article(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL), {"libelle": "Écusson brodé", "montant": "8.00"}, format="json"
    )

    assert resp.status_code == 403
    assert ArticleCatalogue.objects.filter(type_fixe__isnull=True).count() == 0


def test_directeur_financier_ne_peut_pas_creer_un_article(api_client):
    # Décision actée avec l'utilisateur : littéralement "APP-Admin", donc SUPER_ADMIN
    # exclusivement — pas même le Directeur Financier, pourtant haut placé dans la hiérarchie
    # des rôles cotisations (voir marquer_payee/ConfigurationRelance).
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL), {"libelle": "Écusson brodé", "montant": "8.00"}, format="json"
    )

    assert resp.status_code == 403
    assert ArticleCatalogue.objects.filter(type_fixe__isnull=True).count() == 0


def test_admin_peut_modifier_libelle_et_montant(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    article = ArticleCatalogueFactory(libelle="Ancien libellé", montant="10.00")
    _auth(api_client, user)

    resp = api_client.patch(
        _detail_url(article),
        {"libelle": "Nouveau libellé", "montant": "12.50"},
        format="json",
    )

    assert resp.status_code == 200, resp.data
    article.refresh_from_db()
    assert article.libelle == "Nouveau libellé"
    assert str(article.montant) == "12.50"


def test_admin_peut_desactiver_un_article(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    article = ArticleCatalogueFactory(actif=True)
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(article), {"actif": False}, format="json")

    assert resp.status_code == 200, resp.data
    article.refresh_from_db()
    assert article.actif is False


def test_admin_peut_reactiver_un_article(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    article = ArticleCatalogueFactory(actif=False)
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(article), {"actif": True}, format="json")

    assert resp.status_code == 200, resp.data
    article.refresh_from_db()
    assert article.actif is True


def test_membre_ne_peut_pas_modifier_un_article(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    article = ArticleCatalogueFactory(libelle="Inchangé")
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(article), {"libelle": "Piraté"}, format="json")

    assert resp.status_code == 403
    article.refresh_from_db()
    assert article.libelle == "Inchangé"


def test_pas_de_destroy_expose(api_client):
    # Jamais de suppression physique — voir docstring de module ArticleCatalogue : un article se
    # désactive (actif=False) au lieu d'être supprimé.
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    article = ArticleCatalogueFactory()
    _auth(api_client, user)

    resp = api_client.delete(_detail_url(article))

    assert resp.status_code == 405
    assert ArticleCatalogue.objects.filter(id=article.id).exists()


# --- Lignes techniques type_fixe (retour utilisateur du 2026-09-17 : "die bestehende [Cotisation
# annuelle/Frais d'adhésion] müssen auch verwaltbar sein") ---


def test_les_2_lignes_type_fixe_sont_seedees_par_la_migration(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    par_type_fixe = {a["type_fixe"]: a for a in resp.data["results"] if a["type_fixe"]}
    assert set(par_type_fixe) == {TypeArticle.COTISATION, TypeArticle.ADHESION}
    assert par_type_fixe[TypeArticle.COTISATION]["montant"] == "45.00"
    assert par_type_fixe[TypeArticle.COTISATION]["actif"] is True
    assert par_type_fixe[TypeArticle.ADHESION]["montant"] == "15.00"
    assert par_type_fixe[TypeArticle.ADHESION]["actif"] is True


def test_admin_peut_modifier_le_montant_dune_ligne_type_fixe(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(cotisation_fixe), {"montant": "50.00"}, format="json")

    assert resp.status_code == 200, resp.data
    cotisation_fixe.refresh_from_db()
    assert str(cotisation_fixe.montant) == "50.00"


def test_le_libelle_dune_ligne_type_fixe_nest_jamais_modifiable(api_client):
    # Voir ArticleCatalogueSerializer.update : le libellé affiché aux membres reste piloté par
    # les clés i18n existantes, jamais par ce champ — la tentative est ignorée sans erreur plutôt
    # que rejetée, pour ne pas bloquer une modification simultanée du montant.
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    adhesion_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.ADHESION)
    _auth(api_client, user)

    resp = api_client.patch(
        _detail_url(adhesion_fixe),
        {"libelle": "Nouveau nom", "montant": "18.00"},
        format="json",
    )

    assert resp.status_code == 200, resp.data
    adhesion_fixe.refresh_from_db()
    assert adhesion_fixe.libelle == "Frais d'adhésion"
    assert str(adhesion_fixe.montant) == "18.00"


def test_type_fixe_nest_jamais_modifiable_via_lapi(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    _auth(api_client, user)

    resp = api_client.patch(
        _detail_url(cotisation_fixe), {"type_fixe": TypeArticle.ADHESION}, format="json"
    )

    assert resp.status_code == 200, resp.data
    cotisation_fixe.refresh_from_db()
    assert cotisation_fixe.type_fixe == TypeArticle.COTISATION


def test_admin_peut_desactiver_une_ligne_type_fixe(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(cotisation_fixe), {"actif": False}, format="json")

    assert resp.status_code == 200, resp.data
    cotisation_fixe.refresh_from_db()
    assert cotisation_fixe.actif is False


def test_membre_voit_toujours_une_ligne_type_fixe_desactivee(api_client):
    # Corrigé le 2026-09-17 (retour utilisateur : "Die Artikel sind immer noch bei einem anderen
    # User vorhanden aber nicht mehr beim App-Admin") — une version antérieure de ce test
    # affirmait l'inverse (ligne masquée pour un membre) : c'était précisément le bug. Masquer la
    # ligne désactivée empêchait CotisationStepperPage de la distinguer d'une ligne pas encore
    # seedée (repli volontaire vers le tarif par défaut, toujours actif) — le stepper réaffichait
    # donc à tort la carte cotisation/adhésion désactivée à un membre normal. La ligne doit rester
    # visible (avec actif=False) pour que le frontend puisse correctement masquer la carte.
    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.ADHESION).update(actif=False)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    lignes_fixes = {a["type_fixe"]: a["actif"] for a in resp.data["results"] if a["type_fixe"]}
    assert lignes_fixes == {TypeArticle.COTISATION: True, TypeArticle.ADHESION: False}


def test_membre_ne_peut_pas_modifier_une_ligne_type_fixe(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    _auth(api_client, user)

    resp = api_client.patch(_detail_url(cotisation_fixe), {"montant": "999.00"}, format="json")

    assert resp.status_code == 403
    cotisation_fixe.refresh_from_db()
    assert str(cotisation_fixe.montant) == "45.00"


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Beitragsartikel"
# (page_articles_cotisation) désormais pilotée par apps.rbac (real enforcement, y compris pour
# les rôles système eux-mêmes).
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_super_admin_garde_lacces_au_catalogue_meme_si_matrice_dit_aucun(api_client):
    """Défense en profondeur : même en manipulant directement la matrice pour super_admin (ce
    que l'UI/API interdit normalement, voir la garde de RoleModuleMatrixSetView), le bypass
    hartcodé de has_admin_page_access pour l'Administrateur App tient toujours."""
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_articles_cotisation", NiveauAcces.AUCUN)
    admin = User.objects.create_user(
        email="phased-articles-super@example.de", password="Password123!", role=Role.SUPER_ADMIN, is_active=True
    )
    _auth(api_client, admin)

    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    resp = api_client.patch(_detail_url(cotisation_fixe), {"montant": "50.00"}, format="json")
    assert resp.status_code == 200, resp.data


def test_phase_d_bureau_admin_perd_lacces_au_catalogue_par_defaut(api_client):
    """Rollout-regression : Bureau Admin n'a jamais eu accès au catalogue d'articles
    (GESTION_ARTICLES_MIN_LEVEL = Super Admin) — la matrice seedée par 0003 doit reproduire
    exactement ce comportement par défaut, sans qu'aucun admin n'ait rien configuré."""
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "phased-articles-bureau@example.de")
    _auth(api_client, user)

    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    resp = api_client.patch(_detail_url(cotisation_fixe), {"montant": "50.00"}, format="json")
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_gerer_le_catalogue_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import RoleDefinitionFactory, RoleModulePermissionFactory, UserRoleAssignmentFactory

    user, _membre = _user_avec_membre(Role.MEMBRE, "phased-articles-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="articles-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_articles_cotisation", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    _auth(api_client, user)

    cotisation_fixe = ArticleCatalogue.objects.get(type_fixe=TypeArticle.COTISATION)
    resp = api_client.patch(_detail_url(cotisation_fixe), {"montant": "50.00"}, format="json")
    assert resp.status_code == 200, resp.data

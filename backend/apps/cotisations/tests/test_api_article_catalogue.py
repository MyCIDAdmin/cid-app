"""
Tests API — ArticleCatalogueViewSet (retour utilisateur du 2026-09-17 : "Artikeln / Elemente bei
'Cotisation' müssen vom APP-Admin verwaltbar sein (Anlegen / Aktualisieren / Deaktivieren ...)").

Décisions actées avec l'utilisateur (AskUserQuestion) : ces articles s'ajoutent aux 4 types fixes
existants (jamais les remplacer) et leur gestion en écriture est réservée exclusivement à
l'Administrateur App (Role.SUPER_ADMIN) — voir apps.cotisations.permissions.
ArticleCataloguePermission. Pas de suppression exposée (voir test_pas_de_destroy_expose) : un
article se désactive (actif=False), jamais supprimé physiquement (on_delete=PROTECT sur
Cotisation.article_catalogue).
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import ArticleCatalogue
from apps.cotisations.tests.factories import ArticleCatalogueFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

LIST_URL = "cotisations:article-catalogue-list"


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
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["libelle"] == "Écusson brodé"


def test_membre_ne_voit_pas_les_articles_desactives(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    ArticleCatalogueFactory(libelle="Article désactivé", actif=False)
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    assert resp.data["results"] == []


def test_admin_voit_aussi_les_articles_desactives(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    ArticleCatalogueFactory(libelle="Article actif", actif=True)
    ArticleCatalogueFactory(libelle="Article désactivé", actif=False)
    _auth(api_client, user)

    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


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
    assert ArticleCatalogue.objects.count() == 0


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
    assert ArticleCatalogue.objects.count() == 0


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

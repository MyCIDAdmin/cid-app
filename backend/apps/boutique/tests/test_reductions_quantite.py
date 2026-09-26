"""
Tests — réductions par quantité (RegleReduction, demande utilisateur du 2026-09-23 :
"Beim Kauf von über 10 Artikeln... 10% Rabatt", "Beim Kauf von 5 Stück... geschenkten
Artikel"). Couvre le CRUD (Bureau Admin+, IDOR/permissions) et l'application automatique dans
CommandeViewSet.passer/vendre_especes.
"""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import RegleReduction, StatutCommande, TypeReduction
from apps.boutique.tests.factories import (
    ProduitFactory,
    RegleReductionFactory,
    VarianteProduitFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


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


REGLE_LIST_URL = "boutique:regle-reduction-list"
PASSER_URL = "boutique:commande-passer"


def _regle_detail_url(regle):
    return reverse("boutique:regle-reduction-detail", args=[regle.id])


def _adresse_livraison():
    return {
        "nom_destinataire": "Membre Test",
        "adresse_livraison": "Musterstraße 1",
        "code_postal_livraison": "10115",
        "ville_livraison": "Berlin",
        "pays_livraison": "Allemagne",
    }


# --- CRUD / permissions ---


def test_list_regles_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(REGLE_LIST_URL))
    assert resp.status_code == 401


def test_membre_normal_voit_les_regles_actives_dun_produit_publie(api_client):
    produit = ProduitFactory()
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT
    )
    RegleReductionFactory(
        produit=produit, seuil_quantite=8, type_reduction=TypeReduction.ARTICLE_OFFERT, actif=False
    )
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(REGLE_LIST_URL), {"produit": str(produit.id)})

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1  # la règle inactive est masquée à un rôle non-admin


def test_membre_normal_ne_peut_pas_creer_de_regle(api_client):
    produit = ProduitFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(REGLE_LIST_URL),
        {"produit": str(produit.id), "seuil_quantite": 5, "type_reduction": "article_offert"},
    )

    assert resp.status_code == 403


def test_bureau_admin_peut_creer_une_regle_pourcentage(api_client):
    produit = ProduitFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(REGLE_LIST_URL),
        {
            "produit": str(produit.id),
            "seuil_quantite": 10,
            "type_reduction": "pourcentage",
            "pourcentage": 10,
        },
    )

    assert resp.status_code == 201, resp.data
    assert RegleReduction.objects.filter(produit=produit).count() == 1


def test_creer_regle_pourcentage_sans_pourcentage_refuse(api_client):
    produit = ProduitFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(REGLE_LIST_URL),
        {"produit": str(produit.id), "seuil_quantite": 10, "type_reduction": "pourcentage"},
    )

    assert resp.status_code == 400
    assert "pourcentage" in resp.data["details"]


def test_creer_regle_article_offert_avec_pourcentage_refuse(api_client):
    produit = ProduitFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(REGLE_LIST_URL),
        {
            "produit": str(produit.id),
            "seuil_quantite": 5,
            "type_reduction": "article_offert",
            "pourcentage": 10,
        },
    )

    assert resp.status_code == 400
    assert "pourcentage" in resp.data["details"]


def test_bureau_admin_peut_desactiver_une_regle(api_client):
    regle = RegleReductionFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.patch(_regle_detail_url(regle), {"actif": False})

    assert resp.status_code == 200
    regle.refresh_from_db()
    assert regle.actif is False


def test_rh_ne_peut_pas_modifier_une_regle(api_client):
    regle = RegleReductionFactory()
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    _auth(api_client, user)

    resp = api_client.patch(_regle_detail_url(regle), {"actif": False})

    assert resp.status_code == 403


# --- Application automatique à `passer` ---


def test_passer_commande_article_offert_deduit_le_prix_de_larticle_gratuit(api_client):
    produit = ProduitFactory(prix=Decimal("20.00"))
    variante = VarianteProduitFactory(produit=produit, stock=20)
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT
    )
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {"lignes": [{"variante": str(variante.id), "quantite": 5}], **_adresse_livraison()},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    # 5 x 20€ = 100€, 1 article offert (5 // 5 = 1) => 80€.
    assert Decimal(resp.data["montant_total"]) == Decimal("80.00")
    ligne = resp.data["lignes"][0]
    assert ligne["quantite_offerte"] == 1
    assert Decimal(ligne["reduction_quantite"]) == Decimal("20.00")


def test_passer_commande_pourcentage_sappplique_sur_toute_la_ligne(api_client):
    produit = ProduitFactory(prix=Decimal("10.00"))
    variante = VarianteProduitFactory(produit=produit, stock=20)
    RegleReductionFactory(
        produit=produit, seuil_quantite=10, type_reduction=TypeReduction.POURCENTAGE, pourcentage=10
    )
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {"lignes": [{"variante": str(variante.id), "quantite": 10}], **_adresse_livraison()},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    # 10 x 10€ = 100€, -10% => 90€.
    assert Decimal(resp.data["montant_total"]) == Decimal("90.00")


def test_passer_commande_sous_le_seuil_naucune_reduction(api_client):
    produit = ProduitFactory(prix=Decimal("10.00"))
    variante = VarianteProduitFactory(produit=produit, stock=20)
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT
    )
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {"lignes": [{"variante": str(variante.id), "quantite": 4}], **_adresse_livraison()},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_total"]) == Decimal("40.00")
    assert resp.data["lignes"][0]["quantite_offerte"] == 0


def test_passer_commande_regle_inactive_ignoree(api_client):
    produit = ProduitFactory(prix=Decimal("10.00"))
    variante = VarianteProduitFactory(produit=produit, stock=20)
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT, actif=False
    )
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {"lignes": [{"variante": str(variante.id), "quantite": 5}], **_adresse_livraison()},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_total"]) == Decimal("50.00")


def test_vendre_especes_applique_aussi_la_reduction_quantite(api_client):
    produit = ProduitFactory(prix=Decimal("20.00"))
    variante = VarianteProduitFactory(produit=produit, stock=20)
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT
    )
    df_user, _df_membre = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    _client_user, client_membre = _user_avec_membre(Role.MEMBRE, "client@example.de")
    _auth(api_client, df_user)

    resp = api_client.post(
        reverse("boutique:commande-vendre-especes"),
        {"membre": str(client_membre.id), "variante": str(variante.id), "quantite": 5},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_total"]) == Decimal("80.00")
    assert resp.data["statut"] == StatutCommande.CONFIRMEE

"""Tests API — app boutique (FDD §2.2/§3.4, SCD §2.3 A01 : IDOR)."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import StatutCommande, StatutProduit
from apps.boutique.tests.factories import (
    CommandeFactory,
    LigneCommandeFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


PRODUIT_LIST_URL = "boutique:produit-list"
COMMANDE_LIST_URL = "boutique:commande-list"
PASSER_URL = "boutique:commande-passer"


def _produit_detail_url(produit):
    return reverse("boutique:produit-detail", args=[produit.id])


def _commande_detail_url(commande):
    return reverse("boutique:commande-detail", args=[commande.id])


def _annuler_url(commande):
    return reverse("boutique:commande-annuler", args=[commande.id])


def _changer_statut_url(commande):
    return reverse("boutique:commande-changer-statut", args=[commande.id])


def _adresse_livraison():
    return {
        "nom_destinataire": "Membre Test",
        "adresse_livraison": "Musterstraße 1",
        "code_postal_livraison": "10115",
        "ville_livraison": "Berlin",
        "pays_livraison": "Allemagne",
    }


# --- Catalogue : visibilité et permissions d'écriture ---


def test_list_produits_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 401


def test_membre_normal_ne_voit_pas_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m1@example.de")
    ProduitFactory(statut=StatutProduit.BROUILLON, nom="Brouillon secret")
    ProduitFactory(statut=StatutProduit.PUBLIE, nom="Publié visible")
    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    noms = [p["nom"] for p in resp.data["results"]]
    assert "Publié visible" in noms
    assert "Brouillon secret" not in noms


def test_bureau_admin_voit_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau@example.de")
    ProduitFactory(statut=StatutProduit.BROUILLON, nom="Brouillon")
    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    noms = [p["nom"] for p in resp.data["results"]]
    assert "Brouillon" in noms


def test_membre_normal_ne_peut_pas_creer_produit(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m2@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 403


def test_bureau_admin_peut_creer_produit(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau2@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 201
    assert resp.data["statut"] == StatutProduit.BROUILLON


def test_rh_ne_peut_pas_modifier_produit(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    produit = ProduitFactory()
    resp = _auth(api_client, user).patch(_produit_detail_url(produit), {"prix": "99.00"})
    assert resp.status_code == 403


# --- passer commande : stock atomique, prix serveur, panier ---


def test_passer_commande_decremente_le_stock_et_calcule_le_montant(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m3@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("20.00")
    variante.produit.save(update_fields=["prix"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 3}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(resp.data["montant_total"]) == Decimal("60.00")

    variante.refresh_from_db()
    assert variante.stock == 2


def test_passer_commande_ignore_le_prix_envoye_par_le_client(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m4@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("20.00")
    variante.produit.save(update_fields=["prix"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "prix_unitaire": "0.01"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(resp.data["montant_total"]) == Decimal("20.00")
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("20.00")


def test_passer_commande_refuse_si_stock_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m5@example.de")
    variante = VarianteProduitFactory(stock=1)

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 2}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]
    variante.refresh_from_db()
    assert variante.stock == 1


def test_passer_commande_panier_vide_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m6@example.de")
    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {"lignes": [], **_adresse_livraison()},
        format="json",
    )
    assert resp.status_code == 400


def test_passer_commande_produit_non_publie_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m7@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.statut = StatutProduit.ARCHIVE
    variante.produit.save(update_fields=["statut"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 400


# --- IDOR : visibilité et actions sur les commandes ---


def test_membre_ne_voit_que_ses_propres_commandes(api_client):
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m8@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m9@example.de")
    CommandeFactory(membre=membre1)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, user1).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre1.id)


def test_rh_ne_voit_pas_toutes_les_commandes(api_client):
    rh_user, rh_membre = _user_avec_membre(Role.RH, "rh2@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m10@example.de")
    CommandeFactory(membre=rh_membre)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, rh_user).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_bureau_admin_voit_toutes_les_commandes(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau3@example.de")
    _, membre1 = _user_avec_membre(Role.MEMBRE, "m11@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m12@example.de")
    CommandeFactory(membre=membre1)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, admin).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_annuler_commande_dun_autre_membre_refuse(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "m13@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m14@example.de")
    commande = CommandeFactory(membre=membre2, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user1).post(_annuler_url(commande))
    assert resp.status_code in (403, 404)


def test_annuler_sa_propre_commande_restitue_le_stock(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m15@example.de")
    variante = VarianteProduitFactory(stock=5)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    LigneCommandeFactory(commande=commande, variante=variante, quantite=2)
    variante.stock = 3
    variante.save(update_fields=["stock"])

    resp = _auth(api_client, user).post(_annuler_url(commande))
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.ANNULEE

    variante.refresh_from_db()
    assert variante.stock == 5


def test_annuler_commande_deja_expediee_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m16@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)

    resp = _auth(api_client, user).post(_annuler_url(commande))
    assert resp.status_code == 400


# --- changer_statut : réservé Bureau Admin+, transitions valides ---


def test_membre_ne_peut_pas_changer_le_statut(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m17@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 403


def test_bureau_admin_peut_faire_progresser_le_statut(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau4@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m18@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.CONFIRMEE


def test_changer_statut_transition_invalide_refusee(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau5@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m19@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.LIVREE}
    )
    assert resp.status_code == 400


def test_changer_statut_vers_annulee_restitue_le_stock(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau6@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m20@example.de")
    variante = VarianteProduitFactory(stock=5)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)
    LigneCommandeFactory(commande=commande, variante=variante, quantite=2)
    variante.stock = 3
    variante.save(update_fields=["stock"])

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.ANNULEE}
    )
    assert resp.status_code == 200

    variante.refresh_from_db()
    assert variante.stock == 5


def test_changer_statut_sur_commande_terminale_refuse(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau7@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m21@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.REMBOURSEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 400

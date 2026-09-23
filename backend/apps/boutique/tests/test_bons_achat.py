"""
Tests — bons d'achat/Gutscheine (demande utilisateur du 2026-09-23 : "Es soll möglich sein
Gutscheine zu Kaufen. Diese sollen als Gutscheincodes im shop verwenden werden." — révisée le
même jour : "Gutschein soll als Kategorie im shop auftauchen und nicht als eigenes Modul" /
"Gutschein wird ein echtes Produkt im Katalog"). Couvre :
  - l'achat d'un bon d'achat intégré au catalogue (produit type_produit=BON_ACHAT, montant choisi
    par l'acheteur, généré à la confirmation de la Commande — voir views._generer_bons_achat) ;
  - la vérification d'un code (aperçu au checkout) ;
  - l'application d'un bon existant au checkout d'une autre commande (`code_bon_achat`) ;
  - les permissions/IDOR (CLAUDE.md §8).

Les anciens points d'entrée dédiés (BonAchatViewSet.acheter/initier_paiement_en_ligne/
confirmer_paiement) ont été supprimés avec cette révision — un bon d'achat n'a plus de flux de
paiement propre, il suit exactement celui d'une Commande normale.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import (
    BonAchat,
    ModePaiementCommande,
    StatutBonAchat,
    StatutCommande,
    bon_achat_montant_max,
    bon_achat_montant_min,
)
from apps.boutique.tests.factories import (
    BonAchatFactory,
    ProduitBonAchatFactory,
    ProduitFactory,
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


VERIFIER_URL = "boutique:bon-achat-verifier"
PASSER_URL = "boutique:commande-passer"
VENDRE_ESPECES_URL = "boutique:commande-vendre-especes"


def _confirmer_paiement_url(commande_id):
    return reverse("boutique:commande-confirmer-paiement", args=[commande_id])


def _detail_url(bon):
    return reverse("boutique:bon-achat-detail", args=[bon.id])


def _adresse_livraison():
    return {
        "nom_destinataire": "Membre Test",
        "adresse_livraison": "Musterstraße 1",
        "code_postal_livraison": "10115",
        "ville_livraison": "Berlin",
        "pays_livraison": "Allemagne",
    }


# --- Achat d'un bon d'achat intégré au catalogue (demande utilisateur du 2026-09-23) ---


def test_passer_commande_bon_achat_reste_en_attente_sans_generer_de_bon(api_client):
    """Un bon d'achat n'est jamais généré avant confirmation du paiement — voir
    _generer_bons_achat, appelée uniquement aux points de confirmation d'une Commande."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "montant": "80.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_total"]) == Decimal("80.00")
    assert resp.data["statut"] == StatutCommande.EN_ATTENTE
    assert BonAchat.objects.count() == 0


def test_confirmer_paiement_dune_commande_bon_achat_genere_le_bon(api_client):
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "montant": "80.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    commande_id = resp.data["id"]

    user_df, _membre_df = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    _auth(api_client, user_df)
    resp_confirm = api_client.post(_confirmer_paiement_url(commande_id), {"mode_paiement": "virement"})

    assert resp_confirm.status_code == 200, resp_confirm.data
    bon = BonAchat.objects.get(achete_par=membre)
    assert bon.montant_initial == Decimal("80.00")
    assert bon.solde == Decimal("80.00")
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.code.startswith("BON-")
    assert bon.date_expiration is not None
    # Le contenu de l'email HTML "bon prêt à l'emploi" est testé indépendamment dans
    # test_tasks.py (appel direct de la tâche, sans passer par .delay()/un broker Celery) — ici
    # on vérifie seulement que le bon est bien généré et actif.


def test_passer_commande_bon_achat_quantite_genere_plusieurs_bons_independants(api_client):
    """quantite=2 sur une ligne bon_achat produit deux BonAchat distincts, jamais un seul bon
    cumulé — voir docstring de _generer_bons_achat."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 2, "montant": "30.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    commande_id = resp.data["id"]

    user_df, _membre_df = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    _auth(api_client, user_df)
    api_client.post(_confirmer_paiement_url(commande_id), {"mode_paiement": "especes"})

    bons = list(BonAchat.objects.filter(achete_par=membre))
    assert len(bons) == 2
    assert {b.montant_initial for b in bons} == {Decimal("30.00")}
    assert bons[0].code != bons[1].code


def test_passer_commande_bon_achat_couvert_par_un_bon_existant_confirme_et_genere_immediatement(api_client):
    """Un bon d'achat s'achète aussi via un bon existant appliqué au checkout — la commande est
    alors confirmée immédiatement dans `passer` (montant_du<=0), qui doit générer le nouveau bon
    dans la foulée, sans attendre confirmer_paiement."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon_existant = BonAchatFactory(solde=Decimal("100.00"))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "montant": "40.00"}],
            "code_bon_achat": bon_existant.code,
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == StatutCommande.CONFIRMEE
    nouveau_bon = BonAchat.objects.get(achete_par=membre)
    assert nouveau_bon.montant_initial == Decimal("40.00")
    assert nouveau_bon.statut == StatutBonAchat.ACTIF
    bon_existant.refresh_from_db()
    assert bon_existant.solde == Decimal("60.00")


def test_vendre_especes_bon_achat_genere_le_bon_immediatement(api_client):
    """Vente au comptoir (demande utilisateur du 2026-09-21, réutilisée ici) — toujours
    confirmée immédiatement, donc le bon est généré dans le même appel."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    membre_cible = MembreFactory()
    user_df, _membre_df = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    _auth(api_client, user_df)

    resp = api_client.post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "montant": "60.00"},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == StatutCommande.CONFIRMEE
    bon = BonAchat.objects.get(achete_par=membre_cible)
    assert bon.montant_initial == Decimal("60.00")
    assert bon.statut == StatutBonAchat.ACTIF


def test_passer_commande_bon_achat_sans_montant_refuse(api_client):
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]


def test_passer_commande_bon_achat_montant_hors_bornes_refuse(api_client):
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [
                {
                    "variante": str(variante.id),
                    "quantite": 1,
                    "montant": str(bon_achat_montant_max() + Decimal("1.00")),
                }
            ],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]


def test_passer_commande_bon_achat_montant_sous_le_minimum_refuse(api_client):
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [
                {
                    "variante": str(variante.id),
                    "quantite": 1,
                    "montant": str(bon_achat_montant_min() - Decimal("1.00")),
                }
            ],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]


def test_passer_commande_produit_physique_avec_montant_refuse(api_client):
    """`montant` ne s'applique qu'à un bon d'achat — jamais un moyen détourné de fixer le prix
    d'un produit physique (CLAUDE.md §8)."""
    produit = ProduitFactory(prix=Decimal("30.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "montant": "1.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]


def test_passer_commande_bon_achat_ignore_le_stock(api_client):
    """Un bon d'achat n'a pas de stock réel — la VarianteProduit sentinelle n'est jamais
    vérifiée ni décrémentée, contrairement à un produit physique."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    stock_avant = variante.stock
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 5, "montant": "50.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    variante.refresh_from_db()
    assert variante.stock == stock_avant  # inchangé


def test_annuler_commande_bon_achat_non_confirmee_ne_cree_pas_de_bon(api_client):
    """Annuler une commande bon_achat encore en_attente ne doit ni crasher (stock ignoré par
    _restituer_stock) ni générer de BonAchat (jamais confirmée)."""
    produit = ProduitBonAchatFactory()
    variante = produit.variantes.get()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "montant": "20.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    commande_id = resp.data["id"]

    resp_annuler = api_client.post(reverse("boutique:commande-annuler", args=[commande_id]))

    assert resp_annuler.status_code == 200, resp_annuler.data
    assert BonAchat.objects.count() == 0


# --- Vérification (aperçu au checkout, sans consommer le code) ---


def test_verifier_code_valide_retourne_le_solde_sans_lidentite_de_lacheteur(api_client):
    bon = BonAchatFactory(solde=Decimal("30.00"))
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code})

    assert resp.status_code == 200
    assert resp.data["utilisable"] is True
    assert Decimal(resp.data["solde"]) == Decimal("30.00")
    assert "achete_par" not in resp.data


def test_verifier_code_insensible_a_la_casse(api_client):
    bon = BonAchatFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code.lower()})

    assert resp.status_code == 200


def test_verifier_code_epuise_nest_pas_utilisable(api_client):
    bon = BonAchatFactory(statut=StatutBonAchat.EPUISE, solde=Decimal("0.00"))
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code})

    assert resp.status_code == 200
    assert resp.data["utilisable"] is False


def test_verifier_code_expire_nest_pas_utilisable(api_client):
    bon = BonAchatFactory(date_expiration=timezone.now() - timedelta(days=1))
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code})

    assert resp.status_code == 200
    assert resp.data["utilisable"] is False


def test_verifier_code_inconnu_404(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": "BON-INTROUVABLE"})

    assert resp.status_code == 404


# --- list/retrieve — IDOR ---


def test_membre_ne_voit_que_ses_propres_bons(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    BonAchatFactory(achete_par=membre)
    BonAchatFactory()  # un autre membre
    _auth(api_client, user)

    resp = api_client.get(reverse("boutique:bon-achat-list"))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_bureau_admin_voit_tous_les_bons(api_client):
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    BonAchatFactory()
    BonAchatFactory()
    _auth(api_client, user)

    resp = api_client.get(reverse("boutique:bon-achat-list"))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_membre_ne_peut_pas_consulter_le_bon_dun_autre(api_client):
    autre_bon = BonAchatFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.get(_detail_url(autre_bon))

    assert resp.status_code == 404


# --- Application au checkout d'un bon existant (`code_bon_achat`, dépense) ---


def test_passer_commande_avec_bon_achat_couvrant_partiellement(api_client):
    produit = ProduitFactory(prix=Decimal("30.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(solde=Decimal("10.00"))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": bon.code,
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_total"]) == Decimal("30.00")
    assert Decimal(resp.data["montant_bon_achat"]) == Decimal("10.00")
    assert Decimal(resp.data["montant_du"]) == Decimal("20.00")
    assert resp.data["statut"] == StatutCommande.EN_ATTENTE  # reste à payer
    bon.refresh_from_db()
    assert bon.solde == Decimal("0.00")
    assert bon.statut == StatutBonAchat.EPUISE


def test_passer_commande_avec_bon_achat_couvrant_integralement_confirme_immediatement(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(solde=Decimal("50.00"))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": bon.code,
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["montant_du"]) == Decimal("0.00")
    assert resp.data["statut"] == StatutCommande.CONFIRMEE
    assert resp.data["mode_paiement"] == ModePaiementCommande.BON_ACHAT
    bon.refresh_from_db()
    assert bon.solde == Decimal("35.00")
    assert bon.statut == StatutBonAchat.ACTIF  # solde restant, toujours utilisable ailleurs


def test_passer_commande_code_bon_achat_invalide_refuse(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": "BON-INTROUVABLE",
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "code_bon_achat" in resp.data["details"]


def test_passer_commande_code_bon_achat_epuise_refuse(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(statut=StatutBonAchat.EPUISE, solde=Decimal("0.00"))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": bon.code,
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "code_bon_achat" in resp.data["details"]


def test_passer_commande_code_bon_achat_expire_refuse(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(date_expiration=timezone.now() - timedelta(days=1))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": bon.code,
            **_adresse_livraison(),
        },
        format="json",
    )

    assert resp.status_code == 400
    assert "code_bon_achat" in resp.data["details"]


def test_annuler_commande_restitue_le_solde_du_bon_achat(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(solde=Decimal("10.00"))
    _auth(api_client, user)

    resp = api_client.post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            "code_bon_achat": bon.code,
            **_adresse_livraison(),
        },
        format="json",
    )
    commande_id = resp.data["id"]
    bon.refresh_from_db()
    assert bon.solde == Decimal("0.00")
    assert bon.statut == StatutBonAchat.EPUISE

    resp_annuler = api_client.post(reverse("boutique:commande-annuler", args=[commande_id]))

    assert resp_annuler.status_code == 200, resp_annuler.data
    bon.refresh_from_db()
    assert bon.solde == Decimal("10.00")
    assert bon.statut == StatutBonAchat.ACTIF

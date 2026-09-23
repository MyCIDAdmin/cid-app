"""
Tests — bons d'achat/Gutscheine (demande utilisateur du 2026-09-23 : "Es soll möglich sein
Gutscheine zu Kaufen. Diese sollen als Gutscheincodes im shop verwenden werden."). Couvre
l'achat, la vérification, le paiement (en ligne + manuel), l'application au checkout
(`passer`), et les permissions/IDOR (CLAUDE.md §8).
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import BonAchat, ModePaiementCommande, StatutBonAchat, StatutCommande
from apps.boutique.tests.factories import (
    BonAchatFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.cotisations.gateways import GatewayError
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


ACHETER_URL = "boutique:bon-achat-acheter"
VERIFIER_URL = "boutique:bon-achat-verifier"
PASSER_URL = "boutique:commande-passer"


def _initier_url(bon):
    return reverse("boutique:bon-achat-initier-paiement-en-ligne", args=[bon.id])


def _confirmer_url(bon):
    return reverse("boutique:bon-achat-confirmer-paiement", args=[bon.id])


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


# --- Achat ---


def test_acheter_non_authentifie_refuse(api_client):
    resp = api_client.post(reverse(ACHETER_URL), {"montant": "50.00"})
    assert resp.status_code == 401


def test_membre_peut_acheter_un_bon_achat(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(ACHETER_URL), {"montant": "50.00"})

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == StatutBonAchat.EN_ATTENTE
    assert Decimal(resp.data["solde"]) == Decimal("50.00")
    assert resp.data["code"].startswith("BON-")
    bon = BonAchat.objects.get(id=resp.data["id"])
    assert bon.achete_par_id == membre.id


def test_acheter_montant_hors_bornes_refuse(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(ACHETER_URL), {"montant": "1000.00"})

    assert resp.status_code == 400
    assert "montant" in resp.data["details"]


# --- Vérification ---


def test_verifier_code_valide_retourne_le_solde_sans_lidentite_de_lacheteur(api_client):
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF, solde=Decimal("30.00"))
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code})

    assert resp.status_code == 200
    assert resp.data["utilisable"] is True
    assert Decimal(resp.data["solde"]) == Decimal("30.00")
    assert "achete_par" not in resp.data


def test_verifier_code_insensible_a_la_casse(api_client):
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(VERIFIER_URL), {"code": bon.code.lower()})

    assert resp.status_code == 200


def test_verifier_code_en_attente_de_paiement_nest_pas_utilisable(api_client):
    bon = BonAchatFactory(statut=StatutBonAchat.EN_ATTENTE)
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


# --- Paiement en ligne ---


def test_acheteur_peut_initier_paiement_stripe(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.EN_ATTENTE, montant_initial=Decimal("50.00"))
    _auth(api_client, user)

    with patch(
        "apps.boutique.views.creer_session_stripe",
        return_value="https://checkout.stripe.com/session/abc",
    ) as mock_creer:
        resp = api_client.post(_initier_url(bon), {"passerelle": "stripe"})

    assert resp.status_code == 200, resp.data
    args = mock_creer.call_args.args
    assert args[0] == f"BON-{bon.id}"
    assert args[2] == bon.montant_initial


def test_initier_paiement_refuse_si_pas_lacheteur(api_client):
    # IDOR (SCD §2.3 A01) : un Membre normal ne voit même pas le bon d'un autre dans son
    # queryset — get_object() 404 avant la vérification de propriétaire (même comportement que
    # CommandeViewSet, voir test_api_paiement_en_ligne.test_refuse_si_pas_le_proprietaire).
    autre_bon = BonAchatFactory(statut=StatutBonAchat.EN_ATTENTE)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(_initier_url(autre_bon), {"passerelle": "stripe"})

    assert resp.status_code == 404


def test_initier_paiement_refuse_si_deja_actif(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.ACTIF)
    _auth(api_client, user)

    resp = api_client.post(_initier_url(bon), {"passerelle": "stripe"})

    assert resp.status_code == 400


def test_initier_paiement_erreur_gateway_message_generique(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(achete_par=membre, statut=StatutBonAchat.EN_ATTENTE)
    _auth(api_client, user)

    with patch(
        "apps.boutique.views.creer_session_stripe",
        side_effect=GatewayError("STRIPE_SECRET_KEY manquant"),
    ):
        resp = api_client.post(_initier_url(bon), {"passerelle": "stripe"})

    assert resp.status_code == 400
    assert "STRIPE_SECRET_KEY" not in str(resp.data)


# --- Confirmation manuelle (virement/espèces) ---


def test_confirmer_paiement_directeur_financier_active_le_bon(api_client, mailoutbox):
    membre_df = MembreFactory()
    user_df = User.objects.create_user(
        email="df@example.de", password="Password123!", role=Role.DIR_FINANCIER, is_active=True
    )
    user_df.membre = membre_df
    bon = BonAchatFactory(statut=StatutBonAchat.EN_ATTENTE)
    _auth(api_client, user_df)

    resp = api_client.post(_confirmer_url(bon), {"mode_paiement": "virement"})

    assert resp.status_code == 200, resp.data
    bon.refresh_from_db()
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.date_expiration is not None
    assert bon.mode_paiement == ModePaiementCommande.VIREMENT


def test_confirmer_paiement_membre_refuse(api_client):
    bon = BonAchatFactory(statut=StatutBonAchat.EN_ATTENTE)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    _auth(api_client, user)

    resp = api_client.post(_confirmer_url(bon), {"mode_paiement": "virement"})

    assert resp.status_code == 403


def test_confirmer_paiement_deja_actif_refuse(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF)
    _auth(api_client, user)

    resp = api_client.post(_confirmer_url(bon), {"mode_paiement": "virement"})

    assert resp.status_code == 400


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


# --- Application au checkout (`passer`) ---


def test_passer_commande_avec_bon_achat_couvrant_partiellement(api_client):
    produit = ProduitFactory(prix=Decimal("30.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF, solde=Decimal("10.00"))
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
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF, solde=Decimal("50.00"))
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


def test_passer_commande_code_bon_achat_non_paye_refuse(api_client):
    produit = ProduitFactory(prix=Decimal("15.00"))
    variante = VarianteProduitFactory(produit=produit, stock=10)
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    bon = BonAchatFactory(statut=StatutBonAchat.EN_ATTENTE)
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
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF, solde=Decimal("10.00"))
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

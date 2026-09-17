"""
Tests API — CommandeViewSet.initier_paiement_en_ligne (ajouté le 2026-09-17, même principe que
apps.cotisations, voir AHM-46). Les fonctions de création de session/commande PSP sont mockées :
aucun appel réseau réel — voir apps.cotisations.tests.test_gateways pour ces fonctions testées
indépendamment.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import StatutCommande
from apps.boutique.tests.factories import CommandeFactory
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


def _url(commande):
    return reverse("boutique:commande-initier-paiement-en-ligne", args=[commande.id])


def test_non_authentifie_refuse(api_client):
    commande = CommandeFactory(statut=StatutCommande.EN_ATTENTE, montant_total=Decimal("30.00"))
    resp = api_client.post(_url(commande), {"passerelle": "stripe"})
    assert resp.status_code == 401


def test_proprietaire_peut_initier_paiement_stripe(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande = CommandeFactory(
        membre=membre, statut=StatutCommande.EN_ATTENTE, montant_total=Decimal("30.00")
    )
    _auth(api_client, user)

    with patch(
        "apps.boutique.views.creer_session_stripe",
        return_value="https://checkout.stripe.com/session/abc",
    ) as mock_creer:
        resp = api_client.post(_url(commande), {"passerelle": "stripe"})

    assert resp.status_code == 200, resp.data
    assert resp.data["redirect_url"] == "https://checkout.stripe.com/session/abc"
    args = mock_creer.call_args.args
    assert args[0] == commande.id
    assert args[1] == commande.numero_commande
    assert args[2] == commande.montant_total
    assert f"commande={commande.id}" in args[3]  # success_url
    assert f"commande={commande.id}&annule=1" in args[4]  # cancel_url


def test_proprietaire_peut_initier_paiement_paypal(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande = CommandeFactory(
        membre=membre, statut=StatutCommande.EN_ATTENTE, montant_total=Decimal("30.00")
    )
    _auth(api_client, user)

    with patch(
        "apps.boutique.views.creer_commande_paypal",
        return_value="https://sandbox.paypal.com/checkoutnow?token=ORDER-1",
    ) as mock_creer:
        resp = api_client.post(_url(commande), {"passerelle": "paypal"})

    assert resp.status_code == 200, resp.data
    assert resp.data["redirect_url"] == "https://sandbox.paypal.com/checkoutnow?token=ORDER-1"
    mock_creer.assert_called_once()


def test_refuse_sans_passerelle_valide(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    _auth(api_client, user)

    resp = api_client.post(_url(commande), {"passerelle": "virement"})

    assert resp.status_code == 400
    assert "passerelle" in resp.data["details"]


def test_refuse_si_pas_le_proprietaire(api_client):
    # IDOR (SCD §2.3 A01) : un Membre normal (rôle < Bureau Admin) ne voit même pas la
    # commande d'un autre membre dans son queryset — get_object() 404 avant la vérification de
    # propriétaire (même comportement que CotisationViewSet, voir
    # apps.cotisations.tests.test_api_paiement_en_ligne).
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande_autrui = CommandeFactory(statut=StatutCommande.EN_ATTENTE)
    _auth(api_client, user)

    resp = api_client.post(_url(commande_autrui), {"passerelle": "stripe"})

    assert resp.status_code == 404


def test_refuse_meme_pour_directeur_financier_sur_commande_dautrui(api_client):
    # Contrairement à confirmer_paiement, cette action est réservée au titulaire du paiement en
    # libre-service — même le Directeur Financier ne peut pas la déclencher pour un autre membre.
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    commande_autrui = CommandeFactory(statut=StatutCommande.EN_ATTENTE)
    _auth(api_client, user)

    resp = api_client.post(_url(commande_autrui), {"passerelle": "stripe"})

    assert resp.status_code == 403


def test_refuse_si_deja_confirmee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)
    _auth(api_client, user)

    resp = api_client.post(_url(commande), {"passerelle": "stripe"})

    assert resp.status_code == 400


def test_erreur_gateway_renvoie_message_generique(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    _auth(api_client, user)

    with patch(
        "apps.boutique.views.creer_session_stripe",
        side_effect=GatewayError("STRIPE_SECRET_KEY manquant"),
    ):
        resp = api_client.post(_url(commande), {"passerelle": "stripe"})

    assert resp.status_code == 400
    assert "STRIPE_SECRET_KEY" not in str(resp.data)

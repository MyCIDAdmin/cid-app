"""
Tests API — CotisationViewSet.initier_paiement_en_ligne (AHM-46). Les fonctions de création de
session/commande PSP sont mockées : aucun appel réseau réel, l'utilisateur n'ayant pas encore de
clés Stripe/PayPal sandbox au moment de l'implémentation (voir gateways.py/webhooks.py pour ces
fonctions testées indépendamment).
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.gateways import GatewayError
from apps.cotisations.models import StatutCotisation
from apps.cotisations.tests.factories import CotisationFactory
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


def _url(cotisation):
    return reverse("cotisations:cotisation-initier-paiement-en-ligne", args=[cotisation.id])


def test_non_authentifie_refuse(api_client):
    cotisation = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, mode_paiement="carte")
    resp = api_client.post(_url(cotisation))
    assert resp.status_code == 401


def test_proprietaire_peut_initier_paiement_carte(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, mode_paiement="carte"
    )
    _auth(api_client, user)

    with patch(
        "apps.cotisations.views.creer_session_stripe",
        return_value="https://checkout.stripe.com/session/abc",
    ) as mock_creer:
        resp = api_client.post(_url(cotisation))

    assert resp.status_code == 200, resp.data
    assert resp.data["redirect_url"] == "https://checkout.stripe.com/session/abc"
    # Signature généralisée le 2026-09-17 (gateways.py partagé avec apps.boutique) : appelée
    # avec des valeurs scalaires plutôt que l'objet Cotisation lui-même.
    args = mock_creer.call_args.args
    assert args[0] == cotisation.id
    assert args[1] == cotisation.libelle
    # cotisation.montant côté test reste tel que fixé par la factory (chaîne "45.00", jamais
    # recoercé en Decimal tant que l'objet Python n'est pas rechargé depuis la DB) — l'objet
    # utilisé par la vue, lui, vient d'un get_object() frais (Decimal) : on compare la valeur
    # numérique, pas le type.
    assert Decimal(str(args[2])) == Decimal(cotisation.montant)
    assert f"cotisation={cotisation.id}" in args[3]  # success_url
    assert f"cotisation={cotisation.id}&annule=1" in args[4]  # cancel_url


def test_proprietaire_peut_initier_paiement_paypal(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, mode_paiement="paypal"
    )
    _auth(api_client, user)

    with patch(
        "apps.cotisations.views.creer_commande_paypal",
        return_value="https://sandbox.paypal.com/checkoutnow?token=ORDER-1",
    ) as mock_creer:
        resp = api_client.post(_url(cotisation))

    assert resp.status_code == 200, resp.data
    assert resp.data["redirect_url"] == "https://sandbox.paypal.com/checkoutnow?token=ORDER-1"
    args = mock_creer.call_args.args
    assert args[0] == cotisation.id
    assert args[1] == cotisation.libelle
    # Même remarque que pour le test "carte" ci-dessus (Decimal vs. chaîne de la factory).
    assert Decimal(str(args[2])) == Decimal(cotisation.montant)


def test_refuse_pour_le_virement_sepa(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, mode_paiement="virement_sepa"
    )
    _auth(api_client, user)

    resp = api_client.post(_url(cotisation))

    assert resp.status_code == 400
    assert "mode_paiement" in resp.data["details"]


def test_refuse_si_pas_le_proprietaire(api_client):
    # IDOR (SCD §2.3 A01) : un Membre normal (rôle < RH) ne voit même pas la ressource d'un autre
    # membre dans son queryset — get_object() renvoie 404 avant la vérification de propriétaire,
    # même comportement que marquer_payee (test_api.py,
    # test_marquer_payee_refuse_pour_la_cotisation_dun_autre_membre_hors_scope).
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation_autrui = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, mode_paiement="carte")
    _auth(api_client, user)

    resp = api_client.post(_url(cotisation_autrui))

    assert resp.status_code == 404


def test_refuse_meme_pour_directeur_financier_sur_cotisation_dautrui(api_client):
    # Contrairement à marquer_payee (AHM-53), cette action est réservée au titulaire du paiement
    # en libre-service — même le Directeur Financier ne peut pas la déclencher pour un autre
    # membre (voir docstring CotisationViewSet.initier_paiement_en_ligne).
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation_autrui = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, mode_paiement="carte")
    _auth(api_client, user)

    resp = api_client.post(_url(cotisation_autrui))

    assert resp.status_code == 403


def test_refuse_si_deja_payee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.PAYEE, mode_paiement="carte"
    )
    _auth(api_client, user)

    resp = api_client.post(_url(cotisation))

    assert resp.status_code == 400


def test_erreur_gateway_renvoie_message_generique(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, mode_paiement="carte"
    )
    _auth(api_client, user)

    with patch(
        "apps.cotisations.views.creer_session_stripe",
        side_effect=GatewayError("STRIPE_SECRET_KEY manquant"),
    ):
        resp = api_client.post(_url(cotisation))

    assert resp.status_code == 400
    # Le détail interne du PSP ne doit jamais fuiter au client (SCD) — message générique attendu.
    assert "STRIPE_SECRET_KEY" not in str(resp.data)


def test_peut_reessayer_apres_un_echec(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.ECHOUEE, mode_paiement="carte"
    )
    _auth(api_client, user)

    with patch(
        "apps.cotisations.views.creer_session_stripe",
        return_value="https://checkout.stripe.com/session/retry",
    ):
        resp = api_client.post(_url(cotisation))

    assert resp.status_code == 200

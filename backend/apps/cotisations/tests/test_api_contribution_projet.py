"""
Tests API — contributions libres à un projet (TypeArticle.PROJET, module "Projets &
Actions", demande utilisateur du 2026-09-22 point 2 : "Es muss möglich sein freie
Beiträge pro Projekt zu zahlen. Diese Option soll ein- und ausschaltbar sein").

Aucune vue dédiée : ces contributions passent par le CotisationViewSet générique
existant (POST /cotisations/cotisations/), voir CotisationSerializer.validate — ce
fichier teste donc les 3 règles serveur propres au type PROJET (cagnote_active,
echeance_depassee, montant/projet requis), jamais fait confiance au client (CLAUDE.md
§8), au même titre que test_api_article_catalogue.py pour TypeArticle.AUTRE.
"""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.membres.tests.factories import MembreFactory
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

LIST_URL = "cotisations:cotisation-list"


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email):
    user = User.objects.create_user(
        email=email, password="Password123!", role=role, is_active=True
    )
    membre = MembreFactory(user=user)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def test_contribution_a_un_projet_cagnote_active(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "cp1@example.de")
    projet = ProjetFactory(cagnote_active=True, titre="Rénovation local")

    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "montant": "25.50",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["montant"] == "25.50"
    assert resp.data["libelle"] == "Contribution — Rénovation local"
    assert resp.data["membre"] == membre.id
    # Comme pour DON/COTISATION en libre-service : jamais payée directement par le
    # client, en attente jusqu'à confirmation (passerelle en ligne ou Directeur
    # Financier) — voir CotisationViewSet/AHM-53.
    assert resp.data["statut"] == StatutCotisation.EN_ATTENTE


def test_contribution_libelle_personnalise_est_conserve(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "cp2@example.de")
    projet = ProjetFactory(cagnote_active=True)

    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "montant": "10.00",
            "libelle": "En mémoire de Papa",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 201, resp.data
    assert resp.data["libelle"] == "En mémoire de Papa"


def test_contribution_sans_projet_refusee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "cp3@example.de")
    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "montant": "10.00",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 400
    assert "projet" in resp.data["details"]


def test_contribution_sans_montant_refusee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "cp4@example.de")
    projet = ProjetFactory(cagnote_active=True)
    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 400
    assert "montant" in resp.data["details"]


def test_contribution_cagnote_desactivee_refusee(api_client):
    """Demande utilisateur point 2 : "Diese Option soll ein- und ausschaltbar sein" —
    voir Projet.cagnote_active."""
    user, _ = _user_avec_membre(Role.MEMBRE, "cp5@example.de")
    projet = ProjetFactory(cagnote_active=False)
    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "montant": "10.00",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 400
    assert "projet" in resp.data["details"]


def test_contribution_echeance_depassee_refusee(api_client):
    """Demande utilisateur point 4 : la date limite bloque une nouvelle contribution —
    voir Projet.echeance_depassee."""
    user, _ = _user_avec_membre(Role.MEMBRE, "cp6@example.de")
    hier = timezone.localdate() - datetime.timedelta(days=1)
    projet = ProjetFactory(cagnote_active=True, date_limite=hier)
    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "montant": "10.00",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 400
    assert "projet" in resp.data["details"]


def test_contribution_avant_echeance_acceptee(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "cp7@example.de")
    demain = timezone.localdate() + datetime.timedelta(days=1)
    projet = ProjetFactory(cagnote_active=True, date_limite=demain)
    resp = _auth(api_client, user).post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.PROJET,
            "projet": str(projet.id),
            "montant": "10.00",
            "mode_paiement": "carte",
        },
    )
    assert resp.status_code == 201, resp.data


def test_projet_avec_contribution_payee_ne_peut_pas_etre_supprime(api_client):
    """on_delete=PROTECT sur Cotisation.projet (voir apps.cotisations.models) — même
    garantie que article_catalogue : un projet ayant déjà reçu au moins une contribution
    ne peut jamais être supprimé physiquement."""
    from django.db.models import ProtectedError

    projet = ProjetFactory(cagnote_active=True)
    Cotisation.objects.create(
        membre=MembreFactory(),
        type_article=TypeArticle.PROJET,
        projet=projet,
        libelle="Contribution",
        montant=Decimal("10.00"),
        mode_paiement="carte",
        statut=StatutCotisation.PAYEE,
    )
    with pytest.raises(ProtectedError):
        projet.delete()

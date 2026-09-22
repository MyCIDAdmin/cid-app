"""
Tests modèles — app projets. `montant_collecte`/`nb_contributeurs`/`echeance_depassee`
sont TOUJOURS des propriétés calculées à la volée (jamais dénormalisées, voir docstring
de module de models.py) — ces tests vérifient qu'elles reflètent bien, en temps réel, le
registre Cotisation (apps.cotisations), sans jamais lire/écrire un champ dédié sur Projet.
"""

import datetime
from decimal import Decimal

import pytest

from apps.cotisations.models import ModePaiement, StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db


def _contribution(projet, membre=None, montant="10.00", statut=StatutCotisation.PAYEE):
    return CotisationFactory(
        membre=membre or MembreFactory(),
        type_article=TypeArticle.PROJET,
        projet=projet,
        libelle=f"Contribution — {projet.titre}",
        montant=montant,
        mode_paiement=ModePaiement.CARTE,
        statut=statut,
    )


def test_montant_collecte_sans_contribution_est_zero():
    projet = ProjetFactory()
    assert projet.montant_collecte == Decimal("0.00")
    assert projet.nb_contributeurs == 0


def test_montant_collecte_somme_uniquement_les_contributions_payees():
    projet = ProjetFactory()
    _contribution(projet, montant="20.00", statut=StatutCotisation.PAYEE)
    _contribution(projet, montant="15.00", statut=StatutCotisation.PAYEE)
    # En attente/échouée : jamais comptée dans la cagnote (même principe que le registre
    # Cotisation lui-même — seul un paiement CONFIRMÉ compte).
    _contribution(projet, montant="99.00", statut=StatutCotisation.EN_ATTENTE)
    _contribution(projet, montant="99.00", statut=StatutCotisation.ECHOUEE)

    assert projet.montant_collecte == Decimal("35.00")


def test_montant_collecte_ignore_les_contributions_dun_autre_projet():
    projet_a = ProjetFactory()
    projet_b = ProjetFactory()
    _contribution(projet_a, montant="50.00")
    _contribution(projet_b, montant="1000.00")

    assert projet_a.montant_collecte == Decimal("50.00")


def test_nb_contributeurs_compte_les_membres_distincts():
    projet = ProjetFactory()
    membre = MembreFactory()
    # 2 contributions payées du MÊME membre : un seul contributeur.
    _contribution(projet, membre=membre, montant="10.00")
    _contribution(projet, membre=membre, montant="5.00")
    _contribution(projet, montant="7.00")  # un 2e membre, généré par défaut

    assert projet.nb_contributeurs == 2
    assert projet.montant_collecte == Decimal("22.00")


def test_echeance_depassee_sans_date_limite_est_fausse():
    projet = ProjetFactory(date_limite=None)
    assert projet.echeance_depassee is False


def test_echeance_depassee_date_passee():
    hier = datetime.date.today() - datetime.timedelta(days=1)
    projet = ProjetFactory(date_limite=hier)
    assert projet.echeance_depassee is True


def test_echeance_depassee_date_future():
    demain = datetime.date.today() + datetime.timedelta(days=1)
    projet = ProjetFactory(date_limite=demain)
    assert projet.echeance_depassee is False

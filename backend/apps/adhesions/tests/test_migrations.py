"""
Test du backfill de données de la migration 0003 (ajoutée le 2026-09-19, retour utilisateur :
"Die Zahlung taucht nicht im Modul Ausstehende Zahlungen") — voir la migration elle-même pour le
contexte complet. Exécute directement `creer_cotisations_manquantes` avec le registre d'apps réel
(déjà migré par la base de test) plutôt que de rejouer la migration avec django_test_migrations
(non utilisé ailleurs dans ce projet) — même fonction que celle appelée par `RunPython`.
"""

from decimal import Decimal

import pytest
from django.apps import apps

pytestmark = pytest.mark.django_db


def _charger_fonction():
    import importlib

    module = importlib.import_module(
        "apps.adhesions.migrations.0003_backfill_cotisation_souscriptions_en_attente"
    )
    return module.creer_cotisations_manquantes


def test_backfill_cree_une_cotisation_pour_une_souscription_bloquee(mailoutbox):
    from apps.adhesions.models import StatutSouscription
    from apps.adhesions.tests.factories import SouscriptionFactory
    from apps.cotisations.models import StatutCotisation, TypeArticle

    souscription = SouscriptionFactory(
        statut=StatutSouscription.EN_ATTENTE_PAIEMENT, prix_paye=Decimal("120.00")
    )
    assert souscription.cotisation is None

    creer_cotisations_manquantes = _charger_fonction()
    creer_cotisations_manquantes(apps, None)

    souscription.refresh_from_db()
    assert souscription.cotisation is not None
    assert souscription.cotisation.membre_id == souscription.membre_id
    assert souscription.cotisation.type_article == TypeArticle.ADHESION
    assert souscription.cotisation.statut == StatutCotisation.EN_ATTENTE
    assert souscription.cotisation.montant == Decimal("120.00")


def test_backfill_ignore_les_souscriptions_deja_liees_ou_dans_un_autre_statut():
    from apps.adhesions.models import StatutSouscription
    from apps.adhesions.tests.factories import SouscriptionFactory
    from apps.cotisations.models import Cotisation
    from apps.cotisations.tests.factories import CotisationFactory

    cotisation_existante = CotisationFactory()
    deja_liee = SouscriptionFactory(
        statut=StatutSouscription.EN_ATTENTE_PAIEMENT, cotisation=cotisation_existante
    )
    SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    SouscriptionFactory(statut=StatutSouscription.BROUILLON)

    nb_avant = Cotisation.objects.count()
    creer_cotisations_manquantes = _charger_fonction()
    creer_cotisations_manquantes(apps, None)

    assert Cotisation.objects.count() == nb_avant
    deja_liee.refresh_from_db()
    assert deja_liee.cotisation_id == cotisation_existante.id  # inchangée, pas une 2e écriture

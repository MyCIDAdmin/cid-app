"""
Test du backfill de données de la migration 0003 (ajoutée le 2026-09-20, retour utilisateur :
"Confirmer et payer" doit sauter directement au paiement) — voir la migration elle-même pour le
contexte complet. Exécute directement `creer_cotisations_manquantes` avec le registre d'apps réel
(déjà migré par la base de test) plutôt que de rejouer la migration avec django_test_migrations
(non utilisé ailleurs dans ce projet) — même fonction que celle appelée par `RunPython`. Même
principe que apps.adhesions.tests.test_migrations (même jour de la veille, même diagnostic).
"""

from decimal import Decimal

import pytest
from django.apps import apps

pytestmark = pytest.mark.django_db


def _charger_fonction():
    import importlib

    module = importlib.import_module(
        "apps.evenements.migrations.0003_backfill_cotisation_inscriptions_en_attente"
    )
    return module.creer_cotisations_manquantes


def test_backfill_cree_une_cotisation_pour_une_inscription_bloquee():
    from apps.cotisations.models import StatutCotisation, TypeArticle
    from apps.evenements.models import StatutInscription
    from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory

    evenement = EvenementFactory(titre="Match amical", cout=Decimal("40.00"))
    inscription = InscriptionFactory(
        evenement=evenement,
        statut=StatutInscription.EN_ATTENTE_PAIEMENT,
        montant_paye=Decimal("40.00"),
        cotisation=None,
    )
    assert inscription.cotisation is None

    creer_cotisations_manquantes = _charger_fonction()
    creer_cotisations_manquantes(apps, None)

    inscription.refresh_from_db()
    assert inscription.cotisation is not None
    assert inscription.cotisation.membre_id == inscription.membre_id
    assert inscription.cotisation.type_article == TypeArticle.EVENEMENT
    assert inscription.cotisation.statut == StatutCotisation.EN_ATTENTE
    assert inscription.cotisation.montant == Decimal("40.00")


def test_backfill_ignore_les_inscriptions_deja_liees_ou_dans_un_autre_statut():
    from apps.cotisations.models import Cotisation
    from apps.cotisations.tests.factories import CotisationFactory
    from apps.evenements.models import StatutInscription
    from apps.evenements.tests.factories import InscriptionFactory

    cotisation_existante = CotisationFactory()
    deja_liee = InscriptionFactory(
        statut=StatutInscription.EN_ATTENTE_PAIEMENT, cotisation=cotisation_existante
    )
    InscriptionFactory(statut=StatutInscription.CONFIRMEE, cotisation=None)
    InscriptionFactory(statut=StatutInscription.ANNULEE, cotisation=None)

    nb_avant = Cotisation.objects.count()
    creer_cotisations_manquantes = _charger_fonction()
    creer_cotisations_manquantes(apps, None)

    assert Cotisation.objects.count() == nb_avant
    deja_liee.refresh_from_db()
    assert deja_liee.cotisation_id == cotisation_existante.id  # inchangée, pas une 2e écriture

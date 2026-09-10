import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def test_reference_transaction_generee_a_la_creation_si_payee():
    cotisation = CotisationFactory(statut=StatutCotisation.PAYEE, reference_transaction=None)
    assert cotisation.reference_transaction is not None
    assert cotisation.reference_transaction.startswith(f"TXN-{timezone.now().year}-")
    assert cotisation.date_paiement is not None


def test_reference_transaction_absente_si_en_attente():
    cotisation = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE, reference_transaction=None, date_paiement=None
    )
    assert cotisation.reference_transaction is None
    assert cotisation.date_paiement is None


def test_reference_transaction_non_regeneree_a_la_mise_a_jour():
    cotisation = CotisationFactory(statut=StatutCotisation.PAYEE)
    reference_initiale = cotisation.reference_transaction

    cotisation.mode_paiement = "paypal"
    cotisation.save()
    cotisation.refresh_from_db()

    assert cotisation.reference_transaction == reference_initiale


def test_deux_references_distinctes():
    c1 = CotisationFactory(statut=StatutCotisation.PAYEE, reference_transaction=None)
    c2 = CotisationFactory(statut=StatutCotisation.PAYEE, reference_transaction=None)
    assert c1.reference_transaction != c2.reference_transaction


def test_str_format():
    membre = MembreFactory(prenom="Riadh", nom="Bchini")
    cotisation = CotisationFactory(membre=membre, libelle="Cotisation annuelle 2026")
    assert str(cotisation) == f"Cotisation annuelle 2026 — {membre} (Payée)"


def test_montant_doit_etre_strictement_positif():
    cotisation = Cotisation(
        membre=MembreFactory(),
        type_article=TypeArticle.DON,
        libelle="Don libre",
        montant="0.00",
    )
    with pytest.raises(ValidationError):
        cotisation.full_clean()


def test_statut_par_defaut_en_attente():
    cotisation = Cotisation(
        membre=MembreFactory(),
        type_article=TypeArticle.DON,
        libelle="Don libre",
        montant="10.00",
    )
    assert cotisation.statut == StatutCotisation.EN_ATTENTE

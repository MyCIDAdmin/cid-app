import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.cotisations.models import (
    MONTANTS_CATALOGUE,
    ArticleCatalogue,
    Cotisation,
    StatutCotisation,
    TypeArticle,
    article_catalogue_fixe_actif,
    montant_catalogue,
)
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


# --- article_catalogue_fixe_actif / montant_catalogue (retour utilisateur du 2026-09-17) ---


def test_article_catalogue_fixe_actif_est_fail_closed_si_ligne_absente():
    # Changé le 2026-09-17 (retour utilisateur répété : "Die Artikel müssen komplett gelöscht
    # werden") — une ligne type_fixe supprimée (pas seulement désactivée) rend désormais le type
    # indisponible, au lieu de retomber sur l'ancien comportement fail-open (toujours disponible).
    # La migration 0006 seed ces lignes par défaut ; ce test simule leur suppression explicite.
    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.COTISATION).delete()
    assert article_catalogue_fixe_actif(TypeArticle.COTISATION) is False


def test_article_catalogue_fixe_actif_reflete_actif_quand_la_ligne_existe():
    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.ADHESION).update(actif=False)
    assert article_catalogue_fixe_actif(TypeArticle.ADHESION) is False

    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.ADHESION).update(actif=True)
    assert article_catalogue_fixe_actif(TypeArticle.ADHESION) is True


def test_montant_catalogue_retombe_sur_lancien_tarif_si_ligne_absente():
    # montant_catalogue() reste, lui, fail-open (repli défensif pour tasks.py/apps.stats, appelés
    # indépendamment de l'activation) — seule article_catalogue_fixe_actif() ci-dessus décide de
    # la disponibilité réelle dans le stepper. Voir docstring des deux fonctions dans models.py.
    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.COTISATION).delete()
    assert montant_catalogue(TypeArticle.COTISATION) == MONTANTS_CATALOGUE[TypeArticle.COTISATION]

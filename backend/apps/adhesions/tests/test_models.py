from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.adhesions.models import RabaisOffre, StatutCampagne
from apps.adhesions.tests.factories import (
    CampagneAdhesionFactory,
    OffreAdhesionFactory,
    RabaisOffreFactory,
    SouscriptionFactory,
)
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


# --- CampagneAdhesion ---


def test_str_format_campagne():
    campagne = CampagneAdhesionFactory(nom="Adhésion 2026", annee=2026)
    assert str(campagne) == "Adhésion 2026 (2026) — Publiée"


def test_une_seule_campagne_publiee_par_annee():
    CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.PUBLIEE)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.PUBLIEE)


def test_deux_campagnes_brouillon_meme_annee_autorisees():
    CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.BROUILLON)
    CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.BROUILLON)  # ne doit pas lever


def test_campagne_cloturee_puis_nouvelle_publiee_meme_annee_autorisee():
    CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.CLOTUREE)
    CampagneAdhesionFactory(annee=2026, statut=StatutCampagne.PUBLIEE)  # ne doit pas lever


# --- OffreAdhesion ---


def test_str_format_offre():
    campagne = CampagneAdhesionFactory(nom="Adhésion 2026")
    offre = OffreAdhesionFactory(campagne=campagne, nom="Basic")
    assert str(offre) == "Basic — Adhésion 2026"


def test_eligible_pour_age_sans_condition():
    offre = OffreAdhesionFactory(condition_age_min=None, condition_age_max=None)
    assert offre.eligible_pour_age(5) is True
    assert offre.eligible_pour_age(99) is True


def test_eligible_pour_age_avec_bornes():
    offre = OffreAdhesionFactory(condition_age_min=18, condition_age_max=25)
    assert offre.eligible_pour_age(17) is False
    assert offre.eligible_pour_age(18) is True
    assert offre.eligible_pour_age(25) is True
    assert offre.eligible_pour_age(26) is False


# --- RabaisOffre ---


def test_str_format_rabais():
    offre = OffreAdhesionFactory(nom="Basic")
    rabais = RabaisOffreFactory(offre=offre, label_fr="Réduction étudiant")
    assert str(rabais) == "Réduction étudiant — Basic"


def test_calculer_prix_montant_fixe():
    rabais = RabaisOffreFactory(montant_reduction=Decimal("10.00"), pct_reduction=None)
    assert rabais.calculer_prix(Decimal("50.00")) == Decimal("40.00")


def test_calculer_prix_pourcentage():
    rabais = RabaisOffreFactory(montant_reduction=None, pct_reduction=Decimal("20.00"))
    assert rabais.calculer_prix(Decimal("50.00")) == Decimal("40.00")


def test_calculer_prix_ne_descend_jamais_sous_zero():
    rabais = RabaisOffreFactory(montant_reduction=Decimal("999.00"), pct_reduction=None)
    assert rabais.calculer_prix(Decimal("50.00")) == Decimal("0.00")


def test_rabais_montant_et_pourcentage_simultanes_refuse():
    offre = OffreAdhesionFactory()
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RabaisOffre.objects.create(
                offre=offre,
                type_rabais="autre",
                label_fr="Invalide",
                montant_reduction=Decimal("10.00"),
                pct_reduction=Decimal("10.00"),
            )


def test_rabais_ni_montant_ni_pourcentage_refuse():
    offre = OffreAdhesionFactory()
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RabaisOffre.objects.create(
                offre=offre,
                type_rabais="autre",
                label_fr="Invalide",
                montant_reduction=None,
                pct_reduction=None,
            )


# --- Souscription ---


def test_str_format_souscription():
    membre = MembreFactory(prenom="Riadh", nom="Bchini")
    offre = OffreAdhesionFactory(nom="Basic")
    souscription = SouscriptionFactory(membre=membre, offre=offre, campagne=offre.campagne)
    assert str(souscription) == f"{membre} — Basic (En attente de paiement)"


def test_une_seule_souscription_par_membre_et_campagne():
    membre = MembreFactory()
    campagne = CampagneAdhesionFactory()
    offre = OffreAdhesionFactory(campagne=campagne)
    SouscriptionFactory(membre=membre, offre=offre, campagne=campagne)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            SouscriptionFactory(membre=membre, offre=offre, campagne=campagne)


def test_meme_membre_peut_souscrire_a_deux_campagnes_differentes():
    membre = MembreFactory()
    offre1 = OffreAdhesionFactory()
    offre2 = OffreAdhesionFactory()
    SouscriptionFactory(membre=membre, offre=offre1, campagne=offre1.campagne)
    SouscriptionFactory(membre=membre, offre=offre2, campagne=offre2.campagne)  # ne doit pas lever

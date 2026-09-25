from decimal import Decimal

import pytest

from apps.evenements.models import StatutInscription, StatutReservationCovoiturage
from apps.evenements.tests.factories import (
    CovoiturageFactory,
    EvenementFactory,
    InscriptionFactory,
    ReservationCovoiturageFactory,
)

pytestmark = pytest.mark.django_db


def test_places_restantes_decompte_les_inscriptions_actives():
    evenement = EvenementFactory(places_max=5)
    InscriptionFactory(evenement=evenement, places=2)
    InscriptionFactory(evenement=evenement, places=1)
    assert evenement.places_reservees == 3
    assert evenement.places_restantes == 2


def test_places_restantes_ignore_les_inscriptions_annulees():
    evenement = EvenementFactory(places_max=5)
    InscriptionFactory(evenement=evenement, places=3, statut=StatutInscription.ANNULEE)
    assert evenement.places_reservees == 0
    assert evenement.places_restantes == 5


def test_places_restantes_none_si_pas_de_limite():
    evenement = EvenementFactory(places_max=None)
    assert evenement.places_restantes is None


def test_evenement_gratuit_force_cout_a_zero():
    evenement = EvenementFactory(gratuit=True, cout=Decimal("35.00"))
    evenement.refresh_from_db()
    assert evenement.cout == Decimal("0.00")


def test_covoiturage_places_restantes():
    trajet = CovoiturageFactory(places_disponibles=4)
    ReservationCovoiturageFactory(trajet=trajet, places_reservees=2)
    ReservationCovoiturageFactory(
        trajet=trajet, places_reservees=5, statut=StatutReservationCovoiturage.ANNULEE
    )
    assert trajet.places_reservees == 2
    assert trajet.places_restantes == 2


# --- Begleitpersonen / accompagnants (module "Veranstaltungsverwaltung", 2026-09-25) ---


def test_places_reservees_compte_les_accompagnants():
    evenement = EvenementFactory(places_max=10)
    InscriptionFactory(
        evenement=evenement,
        places=2,
        nombre_accompagnants_adultes=1,
        nombre_accompagnants_enfants=2,
    )
    # 2 (membre) + 1 (accompagnant adulte) + 2 (accompagnants enfants) = 5 places occupées.
    assert evenement.places_reservees == 5
    assert evenement.places_restantes == 5


def test_montant_accompagnants_zero_si_accompagnants_non_payants():
    evenement = EvenementFactory(
        accompagnants_payants=False,
        prix_accompagnant_adulte=Decimal("10.00"),
        prix_accompagnant_enfant=Decimal("5.00"),
    )
    inscription = InscriptionFactory(
        evenement=evenement, nombre_accompagnants_adultes=2, nombre_accompagnants_enfants=1
    )
    assert inscription.montant_accompagnants == Decimal("0.00")


def test_montant_accompagnants_calcule_par_palier_si_payants():
    evenement = EvenementFactory(
        accompagnants_payants=True,
        prix_accompagnant_adulte=Decimal("10.00"),
        prix_accompagnant_enfant=Decimal("5.00"),
    )
    inscription = InscriptionFactory(
        evenement=evenement, nombre_accompagnants_adultes=2, nombre_accompagnants_enfants=3
    )
    # 2 * 10.00 + 3 * 5.00 = 35.00
    assert inscription.montant_accompagnants == Decimal("35.00")


def test_montant_accompagnants_independant_de_gratuit():
    """Un événement gratuit pour le membre (cout=0) peut tout de même facturer ses
    accompagnants — accompagnants_payants est indépendant de gratuit/cout (décision de
    conception du module, voir Evenement)."""
    evenement = EvenementFactory(
        gratuit=True,
        accompagnants_payants=True,
        prix_accompagnant_adulte=Decimal("8.00"),
        prix_accompagnant_enfant=Decimal("4.00"),
    )
    inscription = InscriptionFactory(
        evenement=evenement, nombre_accompagnants_adultes=1, nombre_accompagnants_enfants=1
    )
    assert inscription.montant_accompagnants == Decimal("12.00")

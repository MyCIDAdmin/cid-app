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

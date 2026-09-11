import datetime
from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from apps.evenements.models import (
    Covoiturage,
    Evenement,
    Inscription,
    ReservationCovoiturage,
    StatutEvenement,
    StatutInscription,
    StatutReservationCovoiturage,
    TypeEvenement,
)
from apps.membres.tests.factories import MembreFactory


class EvenementFactory(DjangoModelFactory):
    class Meta:
        model = Evenement

    titre = factory.Sequence(lambda n: f"Événement {n}")
    type_evenement = TypeEvenement.DEPLACEMENT
    description = "Description de l'événement."
    date_evenement = factory.LazyFunction(
        lambda: datetime.date.today() + datetime.timedelta(days=30)
    )
    lieu = "Berlin Olympiastadion"
    places_max = 10
    gratuit = False
    cout = Decimal("35.00")
    statut = StatutEvenement.PUBLIE
    created_by = factory.SubFactory(MembreFactory)
    organisateur = factory.SelfAttribute("created_by")


class InscriptionFactory(DjangoModelFactory):
    class Meta:
        model = Inscription

    evenement = factory.SubFactory(EvenementFactory)
    membre = factory.SubFactory(MembreFactory)
    places = 1
    statut = StatutInscription.CONFIRMEE
    montant_paye = Decimal("35.00")


class CovoiturageFactory(DjangoModelFactory):
    class Meta:
        model = Covoiturage

    conducteur = factory.SubFactory(MembreFactory)
    depart = "Berlin Hbf"
    destination = "Stuttgart"
    date_trajet = factory.LazyFunction(lambda: datetime.date.today() + datetime.timedelta(days=20))
    heure_trajet = datetime.time(6, 0)
    places_disponibles = 3
    prix_par_place = Decimal("25.00")


class ReservationCovoiturageFactory(DjangoModelFactory):
    class Meta:
        model = ReservationCovoiturage

    trajet = factory.SubFactory(CovoiturageFactory)
    membre = factory.SubFactory(MembreFactory)
    places_reservees = 1
    statut = StatutReservationCovoiturage.CONFIRMEE

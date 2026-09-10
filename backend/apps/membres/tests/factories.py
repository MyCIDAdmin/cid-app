"""
Factory factory-boy pour Membre — première utilisation de factory-boy dans le projet
(déjà listé dans requirements/dev.txt, jusqu'ici non utilisé). Les modules suivants
(cotisations, adhesions, ...) pourront réutiliser MembreFactory plutôt que dupliquer
la création de fixtures de test.
"""

import factory
from factory.django import DjangoModelFactory

from apps.membres.models import Bundesland, Membre, Sexe, StatutMembre


class MembreFactory(DjangoModelFactory):
    class Meta:
        model = Membre

    prenom = factory.Faker("first_name")
    nom = factory.Faker("last_name")
    date_naissance = factory.Faker("date_of_birth", minimum_age=16, maximum_age=80)
    sexe = Sexe.NON_RENSEIGNE
    email = factory.LazyAttribute(lambda o: f"{o.prenom}.{o.nom}@example.de".lower())
    telephone = "+49 170 1234567"
    cin = factory.Sequence(lambda n: f"{10000000 + n}")
    passeport = None
    adresse_de = factory.Faker("street_address")
    code_postal_de = factory.Faker("postcode")
    ville_de = "Berlin"
    land_de = Bundesland.BERLIN
    ville_origine_tn = "Tunis"
    gouvernorat_tn = "Tunis"
    statut = StatutMembre.ACTIF

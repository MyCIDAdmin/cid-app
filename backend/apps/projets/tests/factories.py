import factory
from factory.django import DjangoModelFactory

from apps.membres.tests.factories import MembreFactory
from apps.projets.models import (
    Projet,
    ProjetImage,
    ProjetMiseAJour,
    ProjetMiseAJourImage,
    SichtbarkeitProjet,
    StatutProjet,
)


class ProjetFactory(DjangoModelFactory):
    class Meta:
        model = Projet

    titre = factory.Sequence(lambda n: f"Projet {n}")
    description_html = "<p>Description du projet.</p>"
    statut = StatutProjet.EN_COURS
    sichtbarkeit = SichtbarkeitProjet.VEROEFFENTLICHT
    responsable = factory.SubFactory(MembreFactory)
    cagnote_active = False
    objectif_montant = None
    date_limite = None
    created_by = factory.SubFactory(MembreFactory)


class ProjetImageFactory(DjangoModelFactory):
    class Meta:
        model = ProjetImage

    projet = factory.SubFactory(ProjetFactory)
    image = factory.django.ImageField(filename="kachel.jpg", color="blue", width=60, height=60)
    ordre = 0
    uploaded_by = factory.SubFactory(MembreFactory)


class ProjetMiseAJourFactory(DjangoModelFactory):
    class Meta:
        model = ProjetMiseAJour

    projet = factory.SubFactory(ProjetFactory)
    titre = factory.Sequence(lambda n: f"Mise à jour {n}")
    contenu_html = "<p>Ce qui a été fait.</p>"
    created_by = factory.SubFactory(MembreFactory)


class ProjetMiseAJourImageFactory(DjangoModelFactory):
    class Meta:
        model = ProjetMiseAJourImage

    mise_a_jour = factory.SubFactory(ProjetMiseAJourFactory)
    image = factory.django.ImageField(filename="maj.jpg", color="green", width=60, height=60)
    ordre = 0

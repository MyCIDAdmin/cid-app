import factory
from factory.django import DjangoModelFactory

from apps.cotisations.models import (
    ArticleCatalogue,
    Cotisation,
    ModePaiement,
    StatutCotisation,
    TypeArticle,
)
from apps.membres.tests.factories import MembreFactory


class CotisationFactory(DjangoModelFactory):
    class Meta:
        model = Cotisation

    membre = factory.SubFactory(MembreFactory)
    type_article = TypeArticle.COTISATION
    libelle = "Cotisation annuelle 2026"
    montant = "45.00"
    mode_paiement = ModePaiement.CARTE
    statut = StatutCotisation.PAYEE
    annee = 2026


class ArticleCatalogueFactory(DjangoModelFactory):
    class Meta:
        model = ArticleCatalogue

    libelle = "T-shirt du club"
    montant = "20.00"
    actif = True

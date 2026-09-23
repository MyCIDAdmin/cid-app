from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from apps.boutique.models import (
    BonAchat,
    CategorieProduit,
    Commande,
    LigneCommande,
    Produit,
    RegleReduction,
    StatutBonAchat,
    StatutCommande,
    StatutProduit,
    TypeReduction,
    VarianteProduit,
)
from apps.membres.tests.factories import MembreFactory


class ProduitFactory(DjangoModelFactory):
    class Meta:
        model = Produit

    nom = factory.Sequence(lambda n: f"Produit {n}")
    categorie = CategorieProduit.VETEMENTS
    description = "Description du produit."
    prix = Decimal("25.00")
    statut = StatutProduit.PUBLIE
    nouveaute = False
    seuil_alerte_stock = 5


class VarianteProduitFactory(DjangoModelFactory):
    class Meta:
        model = VarianteProduit

    produit = factory.SubFactory(ProduitFactory)
    taille = "M"
    couleur = "Rouge"
    stock = 10


class CommandeFactory(DjangoModelFactory):
    class Meta:
        model = Commande

    membre = factory.SubFactory(MembreFactory)
    nom_destinataire = "Membre Test"
    adresse_livraison = "Musterstraße 1"
    code_postal_livraison = "10115"
    ville_livraison = "Berlin"
    pays_livraison = "Allemagne"
    telephone_livraison = "+49 170 1234567"
    montant_total = Decimal("0.00")
    statut = StatutCommande.EN_ATTENTE


class LigneCommandeFactory(DjangoModelFactory):
    class Meta:
        model = LigneCommande

    commande = factory.SubFactory(CommandeFactory)
    variante = factory.SubFactory(VarianteProduitFactory)
    quantite = 1
    prix_unitaire = Decimal("25.00")


class RegleReductionFactory(DjangoModelFactory):
    class Meta:
        model = RegleReduction

    produit = factory.SubFactory(ProduitFactory)
    seuil_quantite = 5
    type_reduction = TypeReduction.ARTICLE_OFFERT
    pourcentage = None
    actif = True


class BonAchatFactory(DjangoModelFactory):
    class Meta:
        model = BonAchat

    montant_initial = Decimal("50.00")
    solde = Decimal("50.00")
    statut = StatutBonAchat.EN_ATTENTE
    achete_par = factory.SubFactory(MembreFactory)

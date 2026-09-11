from decimal import Decimal

import pytest

from apps.boutique.models import Commande
from apps.boutique.tests.factories import (
    CommandeFactory,
    LigneCommandeFactory,
    ProduitFactory,
    VarianteProduitFactory,
)

pytestmark = pytest.mark.django_db


def test_stock_total_additionne_toutes_les_variantes():
    produit = ProduitFactory()
    VarianteProduitFactory(produit=produit, taille="S", stock=3)
    VarianteProduitFactory(produit=produit, taille="M", stock=7)
    assert produit.stock_total == 10


def test_stock_faible_sous_le_seuil_et_non_nul():
    produit = ProduitFactory(seuil_alerte_stock=5)
    VarianteProduitFactory(produit=produit, stock=3)
    assert produit.stock_faible is True
    assert produit.en_rupture is False


def test_en_rupture_quand_stock_total_nul():
    produit = ProduitFactory(seuil_alerte_stock=5)
    VarianteProduitFactory(produit=produit, stock=0)
    assert produit.en_rupture is True
    assert produit.stock_faible is False


def test_numero_commande_genere_automatiquement_et_unique():
    commande1 = CommandeFactory()
    commande2 = CommandeFactory()
    assert commande1.numero_commande.startswith("CMD-")
    assert commande1.numero_commande != commande2.numero_commande
    assert Commande.objects.filter(numero_commande=commande1.numero_commande).count() == 1


def test_ligne_commande_sous_total():
    ligne = LigneCommandeFactory(quantite=3, prix_unitaire=Decimal("12.50"))
    assert ligne.sous_total == Decimal("37.50")

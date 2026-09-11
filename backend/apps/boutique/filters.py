"""Filtres API — app boutique (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters

from .models import Commande, Produit, StatutCommande, StatutProduit


class ProduitFilter(django_filters.FilterSet):
    categorie = django_filters.CharFilter(field_name="categorie")
    statut = django_filters.ChoiceFilter(choices=StatutProduit.choices)
    nouveaute = django_filters.BooleanFilter(field_name="nouveaute")

    class Meta:
        model = Produit
        fields = ["categorie", "statut", "nouveaute"]


class CommandeFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutCommande.choices)
    membre = django_filters.UUIDFilter(field_name="membre_id")

    class Meta:
        model = Commande
        fields = ["statut", "membre"]

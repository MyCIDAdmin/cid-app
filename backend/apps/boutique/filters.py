"""Filtres API — app boutique (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters

from .models import Commande, Produit, Retour, StatutCommande, StatutProduit


class ProduitFilter(django_filters.FilterSet):
    categorie = django_filters.CharFilter(field_name="categorie")
    statut = django_filters.ChoiceFilter(choices=StatutProduit.choices)
    nouveaute = django_filters.BooleanFilter(field_name="nouveaute")
    # Ajouté le 2026-09-23 — permet au catalogue frontend de filtrer/exclure les bons d'achat
    # sans dépendre uniquement de `categorie` (voir CataloguePage.tsx).
    type_produit = django_filters.CharFilter(field_name="type_produit")

    class Meta:
        model = Produit
        fields = ["categorie", "type_produit", "statut", "nouveaute"]


class CommandeFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutCommande.choices)
    membre = django_filters.UUIDFilter(field_name="membre_id")
    # Ajoutés le 2026-09-25 (demande utilisateur, module "Shop-Verwaltung" : "Filtermöglichkeiten
    # hinzufügen z.B. Datumsintervall, Empfänger") — même convention que
    # apps.membres.filters.MembreFilter.date_adhesion_apres/avant. `date__gte`/`date__lte` (et
    # non `gte`/`lte` seuls) car `created_at` est un DateTimeField : comparer directement à une
    # date bornerait `date_avant` à minuit et exclurait toute commande passée ce jour-là.
    date_apres = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_avant = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    destinataire = django_filters.CharFilter(field_name="nom_destinataire", lookup_expr="icontains")

    class Meta:
        model = Commande
        fields = ["statut", "membre"]


class RetourFilter(django_filters.FilterSet):
    commande = django_filters.UUIDFilter(field_name="commande_id")

    class Meta:
        model = Retour
        fields = ["commande"]

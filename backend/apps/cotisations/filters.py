"""Filtres API — app cotisations (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters

from .models import Cotisation, StatutCotisation, TypeArticle


class CotisationFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutCotisation.choices)
    type_article = django_filters.ChoiceFilter(choices=TypeArticle.choices)
    annee = django_filters.NumberFilter(field_name="annee")
    membre = django_filters.UUIDFilter(field_name="membre_id")
    date_paiement_apres = django_filters.DateFilter(field_name="date_paiement", lookup_expr="gte")
    date_paiement_avant = django_filters.DateFilter(field_name="date_paiement", lookup_expr="lte")

    class Meta:
        model = Cotisation
        fields = ["statut", "type_article", "annee", "membre"]

"""Filtres API — app evenements (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters

from .models import Covoiturage, Evenement, Inscription, StatutEvenement, TypeEvenement


class EvenementFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutEvenement.choices)
    type_evenement = django_filters.ChoiceFilter(choices=TypeEvenement.choices)
    date_apres = django_filters.DateFilter(field_name="date_evenement", lookup_expr="gte")
    date_avant = django_filters.DateFilter(field_name="date_evenement", lookup_expr="lte")

    class Meta:
        model = Evenement
        fields = ["statut", "type_evenement"]


class InscriptionFilter(django_filters.FilterSet):
    evenement = django_filters.UUIDFilter(field_name="evenement_id")
    statut = django_filters.CharFilter(field_name="statut")

    class Meta:
        model = Inscription
        fields = ["evenement", "statut"]


class CovoiturageFilter(django_filters.FilterSet):
    evenement = django_filters.UUIDFilter(field_name="evenement_id")
    date_apres = django_filters.DateFilter(field_name="date_trajet", lookup_expr="gte")

    class Meta:
        model = Covoiturage
        fields = ["evenement"]

"""
Filtres API — app membres (TDD §2.3 : "django-filter sur tous les endpoints
liste (ville, statut, date, rôle)").
"""

import django_filters
from django.db.models import Q

from .models import Bundesland, Membre, Pays, StatutMembre


class MembreFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutMembre.choices)
    ville = django_filters.CharFilter(field_name="ville_de", lookup_expr="icontains")
    land = django_filters.ChoiceFilter(field_name="land_de", choices=Bundesland.choices)
    pays = django_filters.ChoiceFilter(choices=Pays.choices)
    nom = django_filters.CharFilter(field_name="nom", lookup_expr="icontains")
    date_adhesion_apres = django_filters.DateFilter(field_name="date_adhesion", lookup_expr="gte")
    date_adhesion_avant = django_filters.DateFilter(field_name="date_adhesion", lookup_expr="lte")
    q = django_filters.CharFilter(
        method="filter_q",
        label="Recherche libre (nom, prénom ou numéro de membre)",
    )

    class Meta:
        model = Membre
        fields = ["statut", "ville", "land", "pays", "nom"]

    def filter_q(self, queryset, name, value):
        return queryset.filter(
            Q(nom__icontains=value) | Q(prenom__icontains=value) | Q(numero_membre__icontains=value)
        )

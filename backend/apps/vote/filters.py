"""Filtres API — app vote (TDD §2.3 : django-filter sur les endpoints liste)."""

import django_filters

from .models import StatutSession, VoteSession


class VoteSessionFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutSession.choices)

    class Meta:
        model = VoteSession
        fields = ["statut"]

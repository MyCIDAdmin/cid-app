"""Filtres API — app vote (TDD §2.3 : django-filter sur les endpoints liste)."""

import django_filters

from .models import StatutSession, VoteSession


class VoteSessionFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutSession.choices)
    # „schnell“ = eigenständige Abstimmung, „wahl“ = gehört zu einer Wahl (App wahlen).
    art = django_filters.ChoiceFilter(
        choices=[("schnell", "schnell"), ("wahl", "wahl")], method="filtrer_art"
    )

    def filtrer_art(self, queryset, name, value):
        return queryset.filter(wahl__isnull=(value == "schnell"))

    class Meta:
        model = VoteSession
        fields = ["statut", "art"]

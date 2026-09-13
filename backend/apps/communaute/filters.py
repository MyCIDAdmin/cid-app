"""Filtres API — app communaute (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters

from .models import CategorieForum, Publication, Sujet


class PublicationFilter(django_filters.FilterSet):
    hashtag = django_filters.CharFilter(method="filtrer_hashtag")
    auteur = django_filters.UUIDFilter(field_name="auteur_id")

    class Meta:
        model = Publication
        fields = ["hashtag", "auteur"]

    def filtrer_hashtag(self, queryset, name, value):
        return queryset.filter(hashtags__label=value.lstrip("#").lower())


class SujetFilter(django_filters.FilterSet):
    categorie = django_filters.ChoiceFilter(choices=CategorieForum.choices)
    auteur = django_filters.UUIDFilter(field_name="auteur_id")

    class Meta:
        model = Sujet
        fields = ["categorie", "auteur"]

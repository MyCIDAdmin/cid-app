"""Filtres API — app communaute (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters
from django.db.models import Q

from .models import CategorieForum, Publication, Sujet


class PublicationFilter(django_filters.FilterSet):
    hashtag = django_filters.CharFilter(method="filtrer_hashtag")
    auteur = django_filters.UUIDFilter(field_name="auteur_id")
    # Neuigkeiten A (Filter-Chips „Wichtig“ / „Fotos“) : ?wichtig=true, ?mit_bild=true.
    wichtig = django_filters.BooleanFilter(field_name="important")
    mit_bild = django_filters.BooleanFilter(method="filtrer_mit_bild")

    class Meta:
        model = Publication
        fields = ["hashtag", "auteur", "wichtig", "mit_bild"]

    def filtrer_mit_bild(self, queryset, name, value):
        mit = ~Q(image="") & Q(image__isnull=False)
        return queryset.filter(mit) if value else queryset.exclude(mit)

    def filtrer_hashtag(self, queryset, name, value):
        return queryset.filter(hashtags__label=value.lstrip("#").lower())


class SujetFilter(django_filters.FilterSet):
    categorie = django_filters.ChoiceFilter(choices=CategorieForum.choices)
    auteur = django_filters.UUIDFilter(field_name="auteur_id")
    # Forum A : Suche in Titel und Text, Chip „Unbeantwortet“ (?unbeantwortet=true). Die
    # Annotation `anzahl_antworten` setzt SujetViewSet.get_queryset.
    suche = django_filters.CharFilter(method="filtrer_suche")
    unbeantwortet = django_filters.BooleanFilter(method="filtrer_unbeantwortet")

    class Meta:
        model = Sujet
        fields = ["categorie", "auteur", "suche", "unbeantwortet"]

    def filtrer_suche(self, queryset, name, value):
        value = (value or "").strip()
        if not value:
            return queryset
        return queryset.filter(Q(titre__icontains=value) | Q(contenu__icontains=value))

    def filtrer_unbeantwortet(self, queryset, name, value):
        return queryset.filter(anzahl_antworten=0) if value else queryset

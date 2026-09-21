"""Filtres API — app cotisations (TDD §2.3 : django-filter sur tous les endpoints liste)."""

import django_filters
from django.db.models import Q

from .models import Cotisation, ModePaiement, StatutCotisation, TypeArticle


class CotisationFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutCotisation.choices)
    type_article = django_filters.ChoiceFilter(choices=TypeArticle.choices)
    # Ajouté le 2026-09-21 (page "Ausstehende Zahlungen", retour utilisateur : "Filter
    # Möglichkeiten hinzufügen") — sert aussi bien à filtrer sur "especes" (nouveau, voir
    # ModePaiement) qu'à retrouver toutes les entrées d'un même mode.
    mode_paiement = django_filters.ChoiceFilter(choices=ModePaiement.choices)
    annee = django_filters.NumberFilter(field_name="annee")
    membre = django_filters.UUIDFilter(field_name="membre_id")
    date_paiement_apres = django_filters.DateFilter(field_name="date_paiement", lookup_expr="gte")
    date_paiement_avant = django_filters.DateFilter(field_name="date_paiement", lookup_expr="lte")
    # Ajoutés le 2026-09-21 — contrairement à date_paiement_*, s'appliquent aussi aux cotisations
    # jamais payées (date_paiement reste NULL tant qu'une cotisation est en_attente/echouee), donc
    # seuls utilisables pour filtrer "Ausstehende Zahlungen" par date sans exclure ces lignes-là.
    date_creation_apres = django_filters.DateFilter(
        field_name="created_at", lookup_expr="date__gte"
    )
    date_creation_avant = django_filters.DateFilter(
        field_name="created_at", lookup_expr="date__lte"
    )
    # Recherche libre (membre ou libellé) — même principe que apps.membres.filters.MembreFilter.q,
    # ajouté le 2026-09-21 pour la même demande utilisateur ("Filter Möglichkeiten hinzufügen").
    q = django_filters.CharFilter(
        method="filter_q",
        label="Recherche libre (nom/prénom/numéro de membre ou libellé)",
    )

    class Meta:
        model = Cotisation
        fields = ["statut", "type_article", "mode_paiement", "annee", "membre"]

    def filter_q(self, queryset, name, value):
        return queryset.filter(
            Q(membre__nom__icontains=value)
            | Q(membre__prenom__icontains=value)
            | Q(membre__numero_membre__icontains=value)
            | Q(libelle__icontains=value)
        )

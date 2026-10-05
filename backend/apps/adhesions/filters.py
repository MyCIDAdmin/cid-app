"""Filtres API — app adhesions (TDD §2.3 : django-filter sur les endpoints liste)."""

import django_filters

from .models import (
    CampagneAdhesion,
    JustificatifRabais,
    OffreAdhesion,
    Souscription,
    StatutCampagne,
    StatutJustificatif,
    StatutSouscription,
)


class CampagneAdhesionFilter(django_filters.FilterSet):
    annee = django_filters.NumberFilter(field_name="annee")
    statut = django_filters.ChoiceFilter(choices=StatutCampagne.choices)

    class Meta:
        model = CampagneAdhesion
        fields = ["annee", "statut"]


class OffreAdhesionFilter(django_filters.FilterSet):
    campagne = django_filters.UUIDFilter(field_name="campagne_id")
    visible = django_filters.BooleanFilter(field_name="visible")

    class Meta:
        model = OffreAdhesion
        fields = ["campagne", "visible"]


class SouscriptionFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutSouscription.choices)
    campagne = django_filters.UUIDFilter(field_name="campagne_id")
    membre = django_filters.UUIDFilter(field_name="membre_id")
    # Historique du module "Nachweise" (point 6, 2026-10-06) : toutes les souscriptions ayant
    # un justificatif déposé, quel que soit son statut (validé/rejeté/en attente).
    avec_justificatif = django_filters.BooleanFilter(
        field_name="justificatif", lookup_expr="isnull", exclude=True
    )

    class Meta:
        model = Souscription
        fields = ["statut", "campagne", "membre", "avec_justificatif"]


class JustificatifRabaisFilter(django_filters.FilterSet):
    statut = django_filters.ChoiceFilter(choices=StatutJustificatif.choices)
    souscription = django_filters.UUIDFilter(field_name="souscription_id")

    class Meta:
        model = JustificatifRabais
        fields = ["statut", "souscription"]

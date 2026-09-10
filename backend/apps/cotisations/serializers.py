"""
Serializers — app cotisations.

Le montant et le libellé des types d'article au tarif fixe de l'association (cotisation
annuelle, frais d'adhésion) sont recalculés côté serveur — jamais fait confiance au frontend
(CLAUDE.md §8). `membre` et `saisie_par` sont résolus par la vue (voir views.perform_create),
pas par le client : un membre normal ne peut créer une cotisation que pour lui-même.
"""

from django.utils import timezone
from rest_framework import serializers

from .models import MONTANTS_CATALOGUE, Cotisation, TypeArticle


class CotisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cotisation
        fields = [
            "id",
            "membre",
            "type_article",
            "libelle",
            "montant",
            "mode_paiement",
            "statut",
            "reference_transaction",
            "annee",
            "saisie_par",
            "date_paiement",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "reference_transaction",
            "saisie_par",
            "date_paiement",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "membre": {"required": False},
            # Non requis en entrée pour cotisation/adhésion : imposés côté serveur ci-dessous
            # (tarif catalogue). Requis manuellement pour les autres types dans validate().
            "libelle": {"required": False},
            "montant": {"required": False},
        }

    def validate(self, attrs):
        type_article = attrs.get("type_article", getattr(self.instance, "type_article", None))
        erreurs = {}

        if type_article == TypeArticle.COTISATION:
            attrs.setdefault("annee", timezone.now().year)
            attrs["libelle"] = f"Cotisation annuelle {attrs['annee']}"
            attrs["montant"] = MONTANTS_CATALOGUE[TypeArticle.COTISATION]
        elif type_article == TypeArticle.ADHESION:
            attrs["libelle"] = "Frais d'adhésion"
            attrs["montant"] = MONTANTS_CATALOGUE[TypeArticle.ADHESION]
        else:
            if not attrs.get("libelle", "").strip():
                erreurs["libelle"] = "Ce champ est requis pour ce type d'article."
            if attrs.get("montant") is None:
                erreurs["montant"] = "Ce champ est requis pour ce type d'article."

        if erreurs:
            raise serializers.ValidationError(erreurs)

        return attrs

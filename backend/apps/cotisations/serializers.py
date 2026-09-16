"""
Serializers — app cotisations.

Le montant et le libellé des types d'article au tarif fixe de l'association (cotisation
annuelle, frais d'adhésion) sont recalculés côté serveur — jamais fait confiance au frontend
(CLAUDE.md §8). `membre` et `saisie_par` sont résolus par la vue (voir views.perform_create),
pas par le client : un membre normal ne peut créer une cotisation que pour lui-même.
"""

from django.utils import timezone
from rest_framework import serializers

from .models import (
    MONTANTS_CATALOGUE,
    ArticleCatalogue,
    ConfigurationRelance,
    Cotisation,
    TypeArticle,
)


class ArticleCatalogueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCatalogue
        fields = ["id", "libelle", "montant", "actif", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        extra_kwargs = {
            # `default=True` explicite : sans lui, DRF.BooleanField.get_value() traite un payload
            # multipart/form-data comme un formulaire HTML et renvoie False (pas le défaut modèle)
            # quand le champ est absent — un client qui ne transmet pas `actif` à la création (cas
            # normal : NouvelArticleForm côté frontend n'envoie que libelle/montant) doit tout de
            # même obtenir un article actif par défaut, quel que soit l'encodage de la requête.
            "actif": {"default": True},
        }


class CotisationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cotisation
        fields = [
            "id",
            "membre",
            "type_article",
            "article_catalogue",
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
            # Non requis en entrée pour cotisation/adhésion/autre : imposés côté serveur
            # ci-dessous (tarif catalogue). Requis manuellement pour les autres types dans
            # validate().
            "libelle": {"required": False},
            "montant": {"required": False},
            "article_catalogue": {"required": False},
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
        elif type_article == TypeArticle.AUTRE:
            # Ajouté le 2026-09-17 — même principe que ci-dessus (CLAUDE.md §8) : le montant/
            # libellé d'un article du catalogue est toujours recalculé côté serveur à partir de
            # l'article référencé, jamais fait confiance au client, voir ArticleCatalogue.
            article = attrs.get("article_catalogue")
            if article is None:
                erreurs["article_catalogue"] = "Ce champ est requis pour ce type d'article."
            elif not article.actif:
                erreurs["article_catalogue"] = "Cet article n'est plus disponible."
            else:
                attrs["libelle"] = article.libelle
                attrs["montant"] = article.montant
        else:
            if not attrs.get("libelle", "").strip():
                erreurs["libelle"] = "Ce champ est requis pour ce type d'article."
            if attrs.get("montant") is None:
                erreurs["montant"] = "Ce champ est requis pour ce type d'article."

        if erreurs:
            raise serializers.ValidationError(erreurs)

        return attrs


class ConfigurationRelanceSerializer(serializers.ModelSerializer):
    """AHM-54 — `modifie_par` est résolu par la vue (l'utilisateur courant), pas par le client."""

    class Meta:
        model = ConfigurationRelance
        fields = ["id", "annee", "date_echeance", "modifie_par", "created_at", "updated_at"]
        read_only_fields = ["id", "modifie_par", "created_at", "updated_at"]

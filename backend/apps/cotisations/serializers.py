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
    ArticleCatalogue,
    ConfigurationRelance,
    Cotisation,
    HistoriqueStatutCotisation,
    StatutCotisation,
    TypeArticle,
    article_catalogue_fixe_actif,
    montant_catalogue,
)


class ArticleCatalogueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCatalogue
        fields = ["id", "libelle", "montant", "actif", "type_fixe", "created_at", "updated_at"]
        read_only_fields = ["id", "type_fixe", "created_at", "updated_at"]
        extra_kwargs = {
            # `default=True` explicite : sans lui, DRF.BooleanField.get_value() traite un payload
            # multipart/form-data comme un formulaire HTML et renvoie False (pas le défaut modèle)
            # quand le champ est absent — un client qui ne transmet pas `actif` à la création (cas
            # normal : NouvelArticleForm côté frontend n'envoie que libelle/montant) doit tout de
            # même obtenir un article actif par défaut, quel que soit l'encodage de la requête.
            "actif": {"default": True},
        }

    def update(self, instance, validated_data):
        # Ajouté le 2026-09-17 : pour les 2 lignes techniques `type_fixe` (cotisation/adhésion,
        # voir docstring de module ArticleCatalogue), le libellé affiché aux membres reste piloté
        # par les clés i18n existantes, jamais par ce champ — on ignore silencieusement toute
        # tentative de le modifier plutôt que de lever une erreur (seuls montant/actif comptent
        # pour ces 2 lignes ; le frontend n'affiche d'ailleurs pas de champ libellé éditable pour
        # elles, voir ArticlesCatalogueCotisationPage).
        if instance.type_fixe:
            validated_data.pop("libelle", None)
        return super().update(instance, validated_data)


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
            # Depuis le 2026-09-17, le tarif n'est plus un dict figé : il est lu dans
            # ArticleCatalogue (voir docstring de module) et peut être désactivé par
            # l'Administrateur App, tout comme un article personnalisé.
            if not article_catalogue_fixe_actif(TypeArticle.COTISATION):
                erreurs["type_article"] = "Ce type d'article n'est plus disponible."
            else:
                attrs.setdefault("annee", timezone.now().year)
                attrs["libelle"] = f"Cotisation annuelle {attrs['annee']}"
                attrs["montant"] = montant_catalogue(TypeArticle.COTISATION)
        elif type_article == TypeArticle.ADHESION:
            if not article_catalogue_fixe_actif(TypeArticle.ADHESION):
                erreurs["type_article"] = "Ce type d'article n'est plus disponible."
            else:
                attrs["libelle"] = "Frais d'adhésion"
                attrs["montant"] = montant_catalogue(TypeArticle.ADHESION)
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


class HistoriqueStatutCotisationSerializer(serializers.ModelSerializer):
    """Entièrement en lecture seule côté API — une entrée n'est jamais créée/modifiée par un
    appel client, seulement par CotisationViewSet.marquer_payee/changer_statut (voir docstring de
    module de models.HistoriqueStatutCotisation)."""

    modifie_par_nom = serializers.SerializerMethodField()

    class Meta:
        model = HistoriqueStatutCotisation
        fields = [
            "id",
            "cotisation",
            "ancien_statut",
            "nouveau_statut",
            "motif",
            "modifie_par",
            "modifie_par_nom",
            "created_at",
        ]
        read_only_fields = fields

    def get_modifie_par_nom(self, obj) -> str | None:
        if obj.modifie_par is None:
            return None
        return f"{obj.modifie_par.prenom} {obj.modifie_par.nom}"


class ChangerStatutCotisationSerializer(serializers.Serializer):
    """Payload de `CotisationViewSet.changer_statut` (AHM-53 étendu, 2026-09-19) — jamais
    persisté directement : la vue s'en sert uniquement pour valider l'entrée avant d'appliquer le
    changement elle-même (voir views.py)."""

    statut = serializers.ChoiceField(choices=StatutCotisation.choices)
    motif = serializers.CharField(required=False, allow_blank=True, default="")

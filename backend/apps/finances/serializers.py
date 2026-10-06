import uuid
from decimal import Decimal

import magic
from rest_framework import serializers

from .models import BudgetAnnuel, CategorieDepense, Depense, StatutDepense
from .services import nom_utilisateur

MIME_AUTORISES = {"application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png"}
TAILLE_MAX = 5 * 1024 * 1024


class CategorieDepenseSerializer(serializers.ModelSerializer):
    namen = serializers.DictField(read_only=True)

    class Meta:
        model = CategorieDepense
        fields = ["id", "nom", "nom_de", "nom_ar", "namen", "actif", "ordre"]
        read_only_fields = ["namen"]


class DepenseSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source="categorie.nom", read_only=True)
    categorie_namen = serializers.DictField(source="categorie.namen", read_only=True)
    evenement_titre = serializers.CharField(source="evenement.titre", read_only=True, default=None)
    projet_titre = serializers.CharField(source="projet.titre", read_only=True, default=None)
    aufgabe_titel = serializers.CharField(source="aufgabe.titel", read_only=True, default=None)
    saisie_par_nom = serializers.SerializerMethodField()
    decide_par_nom = serializers.SerializerMethodField()
    justificatif_url = serializers.SerializerMethodField()
    justificatif = serializers.FileField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = Depense
        fields = [
            "id",
            "date_depense",
            "montant",
            "categorie",
            "categorie_nom",
            "categorie_namen",
            "fournisseur",
            "description",
            "evenement",
            "evenement_titre",
            "projet",
            "projet_titre",
            "aufgabe",
            "aufgabe_titel",
            "justificatif",
            "justificatif_url",
            "statut",
            "saisie_par",
            "saisie_par_nom",
            "decide_par_nom",
            "date_decision",
            "motif_rejet",
            "created_at",
        ]
        read_only_fields = ["statut", "saisie_par", "date_decision", "motif_rejet", "created_at"]

    def get_saisie_par_nom(self, obj):
        return nom_utilisateur(obj.saisie_par)

    def get_decide_par_nom(self, obj):
        return nom_utilisateur(obj.decide_par)

    def get_justificatif_url(self, obj):
        return obj.justificatif.url if obj.justificatif else None

    def validate_categorie(self, categorie):
        if not categorie.actif:
            raise serializers.ValidationError("Catégorie désactivée.")
        return categorie

    def validate(self, attrs):
        # Eine Aufgabe gehört immer zum Projekt der Ausgabe (2026-10-06).
        aufgabe = attrs.get("aufgabe", self.instance.aufgabe if self.instance else None)
        projet = attrs.get("projet", self.instance.projet if self.instance else None)
        if aufgabe is not None and (projet is None or aufgabe.projet_id != projet.id):
            raise serializers.ValidationError(
                {"aufgabe": "Die Aufgabe gehört nicht zum gewählten Projekt."}
            )
        return attrs

    def validate_justificatif(self, fichier):
        if fichier is None:
            return fichier
        if fichier.size > TAILLE_MAX:
            raise serializers.ValidationError("Fichier trop volumineux (max 5 Mo).")
        contenu = fichier.read()
        fichier.seek(0)
        extension = MIME_AUTORISES.get(magic.from_buffer(contenu, mime=True))
        if extension is None:
            raise serializers.ValidationError("Format non supporté (PDF, JPEG ou PNG).")
        fichier.name = f"{uuid.uuid4()}.{extension}"
        return fichier

    def update(self, instance, validated_data):
        # Une dépense rejetée corrigée repart en validation.
        if instance.statut == StatutDepense.REJETEE:
            instance.statut = StatutDepense.EN_ATTENTE
            instance.motif_rejet = ""
            instance.decide_par = None
            instance.date_decision = None
        return super().update(instance, validated_data)


class BudgetLigneSerializer(serializers.Serializer):
    categorie = serializers.PrimaryKeyRelatedField(queryset=CategorieDepense.objects.all())
    montant = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"))


class BudgetDefinirSerializer(serializers.Serializer):
    annee = serializers.IntegerField(min_value=2000, max_value=2100)
    lignes = BudgetLigneSerializer(many=True)


class BudgetAnnuelSerializer(serializers.ModelSerializer):
    categorie_nom = serializers.CharField(source="categorie.nom", read_only=True)
    categorie_namen = serializers.DictField(source="categorie.namen", read_only=True)

    class Meta:
        model = BudgetAnnuel
        fields = ["id", "annee", "categorie", "categorie_nom", "categorie_namen", "montant"]

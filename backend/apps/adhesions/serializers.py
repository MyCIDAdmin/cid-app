"""
Serializers — app adhesions.

Le prix payé n'est jamais fait confiance au frontend (CLAUDE.md §8) : SouscrireSerializer ne
reçoit qu'une offre (et, optionnellement, un rabais) ; le prix et le statut de la souscription
sont entièrement recalculés côté serveur dans SouscriptionViewSet.souscrire (voir views.py).
"""

from rest_framework import serializers

from .models import CampagneAdhesion, OffreAdhesion, RabaisOffre, Souscription, StatutCampagne


class RabaisOffreSerializer(serializers.ModelSerializer):
    class Meta:
        model = RabaisOffre
        fields = [
            "id",
            "offre",
            "type_rabais",
            "label_fr",
            "label_de",
            "label_ar",
            "montant_reduction",
            "pct_reduction",
            "justificatif_requis",
            "instructions_fr",
            "instructions_de",
            "instructions_ar",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        montant = attrs.get("montant_reduction", getattr(self.instance, "montant_reduction", None))
        pct = attrs.get("pct_reduction", getattr(self.instance, "pct_reduction", None))
        if (montant is None) == (pct is None):
            raise serializers.ValidationError(
                "Exactement un des deux champs montant_reduction / pct_reduction doit être "
                "renseigné (pas les deux, pas aucun)."
            )
        return attrs


class OffreAdhesionSerializer(serializers.ModelSerializer):
    rabais = RabaisOffreSerializer(many=True, read_only=True)

    class Meta:
        model = OffreAdhesion
        fields = [
            "id",
            "campagne",
            "nom",
            "prix_plein",
            "description",
            "avantages",
            "condition_age_min",
            "condition_age_max",
            "visible",
            "ordre",
            "rabais",
        ]
        read_only_fields = ["id"]


class CampagneAdhesionSerializer(serializers.ModelSerializer):
    offres = OffreAdhesionSerializer(many=True, read_only=True)

    class Meta:
        model = CampagneAdhesion
        fields = [
            "id",
            "nom",
            "annee",
            "date_debut",
            "date_fin",
            "description",
            "statut",
            "created_by",
            "created_at",
            "offres",
        ]
        read_only_fields = ["id", "statut", "created_by", "created_at"]

    def validate(self, attrs):
        date_debut = attrs.get("date_debut", getattr(self.instance, "date_debut", None))
        date_fin = attrs.get("date_fin", getattr(self.instance, "date_fin", None))
        if date_debut and date_fin and date_fin < date_debut:
            raise serializers.ValidationError(
                {"date_fin": "La date de fin doit être postérieure à la date de début."}
            )
        return attrs


class SouscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Souscription
        fields = [
            "id",
            "membre",
            "offre",
            "campagne",
            "date_souscription",
            "prix_paye",
            "rabais",
            "statut",
            "cotisation",
            "snapshot_avantages",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SouscrireSerializer(serializers.Serializer):
    """Entrée de l'action souscrire — voir SouscriptionViewSet.souscrire pour le calcul serveur."""

    offre = serializers.PrimaryKeyRelatedField(queryset=OffreAdhesion.objects.all())
    rabais = serializers.PrimaryKeyRelatedField(
        queryset=RabaisOffre.objects.all(), required=False, allow_null=True
    )

    def validate(self, attrs):
        offre = attrs["offre"]
        rabais = attrs.get("rabais")

        if not offre.visible:
            raise serializers.ValidationError({"offre": "Cette offre n'est plus disponible."})
        if offre.campagne.statut != StatutCampagne.PUBLIEE:
            raise serializers.ValidationError(
                {"offre": "La campagne de cette offre n'est pas ouverte aux souscriptions."}
            )

        membre = self.context["membre"]
        if not offre.eligible_pour_age(membre.age):
            raise serializers.ValidationError(
                {"offre": "Vous ne remplissez pas la condition d'âge de cette offre."}
            )

        if rabais is not None and rabais.offre_id != offre.id:
            raise serializers.ValidationError(
                {"rabais": "Ce rabais ne correspond pas à l'offre sélectionnée."}
            )

        return attrs

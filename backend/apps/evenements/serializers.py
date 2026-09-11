"""
Serializers — app evenements.

Le montant payé n'est jamais fait confiance au frontend (CLAUDE.md §8) : InscrireSerializer
et RejoindreTrajetSerializer ne reçoivent que des places ; le montant est recalculé côté
serveur dans les vues (voir views.py), à partir de evenement.cout / trajet.prix_par_place.
"""

from rest_framework import serializers

from .models import Covoiturage, Evenement, Inscription, ReservationCovoiturage, StatutEvenement


class EvenementSerializer(serializers.ModelSerializer):
    places_reservees = serializers.IntegerField(read_only=True)
    places_restantes = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = Evenement
        fields = [
            "id",
            "titre",
            "type_evenement",
            "description",
            "date_evenement",
            "heure",
            "lieu",
            "point_rdv",
            "places_max",
            "gratuit",
            "cout",
            "organisateur",
            "statut",
            "places_reservees",
            "places_restantes",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "statut", "created_by", "created_at", "updated_at"]

    def validate(self, attrs):
        places_max = attrs.get("places_max", getattr(self.instance, "places_max", None))
        if places_max is not None and places_max <= 0:
            raise serializers.ValidationError(
                {"places_max": "Le nombre de places doit être strictement positif."}
            )
        return attrs


class InscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Inscription
        fields = [
            "id",
            "evenement",
            "membre",
            "places",
            "regime_alimentaire",
            "remarques",
            "montant_paye",
            "statut",
            "cotisation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class InscrireSerializer(serializers.Serializer):
    """Entrée de l'action `inscrire` — voir EvenementViewSet.inscrire pour le calcul et la
    vérification de capacité atomiques (SELECT FOR UPDATE)."""

    evenement = serializers.PrimaryKeyRelatedField(queryset=Evenement.objects.all())
    places = serializers.IntegerField(min_value=1, default=1)
    regime_alimentaire = serializers.ChoiceField(
        choices=Inscription._meta.get_field("regime_alimentaire").choices, required=False
    )
    remarques = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_evenement(self, evenement):
        if evenement.statut != StatutEvenement.PUBLIE:
            raise serializers.ValidationError("Cet événement n'est pas ouvert aux inscriptions.")
        return evenement


class CovoiturageSerializer(serializers.ModelSerializer):
    places_reservees = serializers.IntegerField(read_only=True)
    places_restantes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Covoiturage
        fields = [
            "id",
            "conducteur",
            "evenement",
            "depart",
            "destination",
            "date_trajet",
            "heure_trajet",
            "places_disponibles",
            "prix_par_place",
            "vehicule",
            "places_reservees",
            "places_restantes",
            "created_at",
        ]
        read_only_fields = ["id", "conducteur", "created_at"]


class ReservationCovoiturageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReservationCovoiturage
        fields = [
            "id",
            "trajet",
            "membre",
            "places_reservees",
            "point_prise_en_charge",
            "statut",
            "created_at",
        ]
        read_only_fields = fields


class RejoindreTrajetSerializer(serializers.Serializer):
    """Entrée de l'action `rejoindre` — voir CovoiturageViewSet.rejoindre."""

    places_reservees = serializers.IntegerField(min_value=1, default=1)
    point_prise_en_charge = serializers.CharField(required=False, allow_blank=True, default="")

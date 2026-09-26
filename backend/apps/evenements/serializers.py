"""
Serializers — app evenements.

Le montant payé n'est jamais fait confiance au frontend (CLAUDE.md §8) : InscrireSerializer
et RejoindreTrajetSerializer ne reçoivent que des places ; le montant est recalculé côté
serveur dans les vues (voir views.py), à partir de evenement.cout / trajet.prix_par_place.
"""

from rest_framework import serializers

from apps.membres.models import Membre

from .models import Covoiturage, Evenement, Inscription, ReservationCovoiturage, StatutEvenement


class MembreResumeSerializer(serializers.ModelSerializer):
    """Identité minimale d'un membre, utilisée en lecture imbriquée (organisateur d'un
    événement, conducteur d'un trajet) — même principe que AuteurSerializer côté
    apps.communaute, dupliqué ici plutôt qu'importé pour ne pas créer de dépendance entre
    apps métier ; évite un aller-retour supplémentaire côté frontend pour afficher un nom."""

    class Meta:
        model = Membre
        fields = ["id", "prenom", "nom"]


class EvenementResumeSerializer(serializers.ModelSerializer):
    """Résumé minimal d'un événement, utilisé en lecture imbriquée dans InscriptionSerializer
    ("Mes inscriptions" a besoin du titre/de la date sans requête supplémentaire — Inscription
    n'expose sinon que l'id de l'événement)."""

    class Meta:
        model = Evenement
        fields = ["id", "titre", "date_evenement", "heure", "lieu", "cout", "gratuit", "statut"]


class EvenementSerializer(serializers.ModelSerializer):
    places_reservees = serializers.IntegerField(read_only=True)
    places_restantes = serializers.IntegerField(read_only=True, allow_null=True)
    organisateur_detail = MembreResumeSerializer(source="organisateur", read_only=True)

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
            "accompagnants_payants",
            "prix_accompagnant_adulte",
            "prix_accompagnant_enfant",
            "age_limite_accompagnant_enfant",
            "organisateur",
            "organisateur_detail",
            "statut",
            "visible_public",
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
    evenement_detail = EvenementResumeSerializer(source="evenement", read_only=True)

    class Meta:
        model = Inscription
        fields = [
            "id",
            "evenement",
            "evenement_detail",
            "membre",
            "places",
            "nombre_accompagnants_adultes",
            "nombre_accompagnants_enfants",
            "regime_alimentaire",
            "remarques",
            "montant_paye",
            "statut",
            "cotisation",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "evenement",
            "membre",
            "places",
            "nombre_accompagnants_adultes",
            "nombre_accompagnants_enfants",
            "regime_alimentaire",
            "remarques",
            "montant_paye",
            "statut",
            "cotisation",
            "created_at",
            "updated_at",
        ]


class InscrireSerializer(serializers.Serializer):
    """Entrée de l'action `inscrire` — voir EvenementViewSet.inscrire pour le calcul et la
    vérification de capacité atomiques (SELECT FOR UPDATE)."""

    evenement = serializers.PrimaryKeyRelatedField(queryset=Evenement.objects.all())
    places = serializers.IntegerField(min_value=1, default=1)
    nombre_accompagnants_adultes = serializers.IntegerField(min_value=0, default=0)
    nombre_accompagnants_enfants = serializers.IntegerField(min_value=0, default=0)
    regime_alimentaire = serializers.ChoiceField(
        choices=Inscription._meta.get_field("regime_alimentaire").choices, required=False
    )
    remarques = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_evenement(self, evenement):
        if evenement.statut != StatutEvenement.PUBLIE:
            raise serializers.ValidationError("Cet événement n'est pas ouvert aux inscriptions.")
        return evenement


class InscrireEspecesSerializer(InscrireSerializer):
    """Variante de InscrireSerializer pour EvenementViewSet.inscrire_especes (ajoutée le
    2026-09-21, retour utilisateur : "Event als Artikeltyp hinzufügen. Beim Anklicken sollen
    aktive Events angezeigt [werden]", dans le formulaire "Barzahlung eintragen" de
    CotisationsEnAttentePage) — mêmes champs qu'une inscription libre-service, plus `membre`
    explicite : contrairement à `inscrire` (toujours le membre du compte authentifié), le
    Directeur Financier/Admin inscrit ici un AUTRE membre, même principe que la saisie pour
    autrui F-015 côté apps.cotisations (CotisationViewSet.perform_create)."""

    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())


class CovoiturageSerializer(serializers.ModelSerializer):
    places_reservees = serializers.IntegerField(read_only=True)
    places_restantes = serializers.IntegerField(read_only=True)
    conducteur_detail = MembreResumeSerializer(source="conducteur", read_only=True)

    class Meta:
        model = Covoiturage
        fields = [
            "id",
            "conducteur",
            "conducteur_detail",
            "evenement",
            "depart",
            "destination",
            "date_trajet",
            "heure_trajet",
            "lieu_rendez_vous",
            "places_disponibles",
            "prix_par_place",
            "vehicule",
            "remarques",
            "places_reservees",
            "places_restantes",
            "created_at",
        ]
        read_only_fields = ["id", "conducteur", "created_at"]


class ReservationCovoiturageSerializer(serializers.ModelSerializer):
    # Affiché sur la tuile Fahrgemeinschaft ("qui a réservé", signalé par un utilisateur —
    # 2026-09-25) — même principe que conducteur_detail ci-dessus.
    membre_detail = MembreResumeSerializer(source="membre", read_only=True)

    class Meta:
        model = ReservationCovoiturage
        fields = [
            "id",
            "trajet",
            "membre",
            "membre_detail",
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

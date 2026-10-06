"""
Serializers — app evenements.

Le montant payé n'est jamais fait confiance au frontend (CLAUDE.md §8) : InscrireSerializer
et RejoindreTrajetSerializer ne reçoivent que des places ; le montant est recalculé côté
serveur dans les vues (voir views.py), à partir de evenement.cout / trajet.prix_par_place.
"""

from rest_framework import serializers

from apps.communaute.validators import valider_et_reencoder_photo
from apps.membres.models import Membre
from apps.rbac.models import NiveauAcces
from apps.rbac.services import est_membre_actif, has_admin_page_access
from apps.uebersetzung.serializers import UebersetzungenField

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
    # Point 1.1/3 (2026-10-05) : affichage seul pour les non-membres/anonymes.
    reserve_membres = serializers.SerializerMethodField()
    cout_applicable = serializers.SerializerMethodField()

    uebersetzungen = UebersetzungenField()

    class Meta:
        model = Evenement
        fields = [
            "id",
            "uebersetzungen",
            "titre",
            "type_evenement",
            "description",
            "date_evenement",
            "heure",
            "date_fin",
            "heure_fin",
            "date_limite_paiement",
            "lieu",
            "point_rdv",
            "lieu_maps_url",
            "image",
            "places_max",
            "gratuit",
            "cout",
            "cout_non_membre",
            "cout_applicable",
            "reserve_membres",
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

    def _est_membre(self) -> bool:
        request = self.context.get("request")
        return est_membre_actif(getattr(request, "user", None))

    def get_reserve_membres(self, obj) -> bool:
        return not obj.visible_public

    def get_cout_applicable(self, obj) -> str:
        return str(obj.cout_pour(self._est_membre()))

    def _peut_voir_details_membres(self) -> bool:
        # Membre actif OU gestionnaire de la page Veranstaltungsverwaltung (sinon l'admin qui
        # édite un événement le recevrait vidé de son point RDV et l'écraserait en l'enregistrant).
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if self._est_membre():
            return True
        return bool(
            user
            and user.is_authenticated
            and has_admin_page_access(user, "page_events", required=NiveauAcces.LECTURE)
        )

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Point 2.1/2.2 (2026-10-06) : pour un événement réservé aux membres, le point de
        # rendez-vous et le lien Google Maps ne sont jamais envoyés à un visiteur/non-membre
        # (masqués côté serveur, pas seulement dans l'interface).
        if not instance.visible_public and not self._peut_voir_details_membres():
            data["point_rdv"] = ""
            data["lieu_maps_url"] = ""
        return data

    def validate(self, attrs):
        def valeur(nom):
            return attrs.get(nom, getattr(self.instance, nom, None))

        debut, fin = valeur("date_evenement"), valeur("date_fin")
        heure, heure_fin = valeur("heure"), valeur("heure_fin")
        if debut and fin and fin < debut:
            raise serializers.ValidationError(
                {"date_fin": "La date de fin ne peut pas précéder la date de début."}
            )
        if heure_fin and not fin and heure and debut and heure_fin <= heure:
            raise serializers.ValidationError(
                {"heure_fin": "L'heure de fin doit être postérieure à l'heure de début."}
            )
        if fin and debut and fin == debut and heure and heure_fin and heure_fin <= heure:
            raise serializers.ValidationError(
                {"heure_fin": "L'heure de fin doit être postérieure à l'heure de début."}
            )
        limite = valeur("date_limite_paiement")
        if limite and debut and limite > debut:
            raise serializers.ValidationError(
                {"date_limite_paiement": "L'échéance de paiement doit précéder l'événement."}
            )
        places_max = attrs.get("places_max", getattr(self.instance, "places_max", None))
        if places_max is not None and places_max <= 0:
            raise serializers.ValidationError(
                {"places_max": "Le nombre de places doit être strictement positif."}
            )
        return attrs

    def validate_image(self, image):
        # CLAUDE.md §8 : MIME réel vérifié + ré-encodage Pillow (EXIF supprimé), jamais les
        # octets bruts du client stockés tels quels — voir docstring de valider_et_reencoder_photo.
        return valider_et_reencoder_photo(image)


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
            "lieu_rendez_vous_maps_url",
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

"""
Serializers — app adhesions.

Le prix payé n'est jamais fait confiance au frontend (CLAUDE.md §8) : SouscrireSerializer ne
reçoit qu'une offre (et, optionnellement, un rabais) ; le prix et le statut de la souscription
sont entièrement recalculés côté serveur dans SouscriptionViewSet.souscrire (voir views.py).
"""

import uuid

import magic
from rest_framework import serializers

from apps.communaute.validators import valider_et_reencoder_photo
from apps.membres.models import Membre

from .models import (
    CampagneAdhesion,
    JustificatifRabais,
    OffreAdhesion,
    RabaisOffre,
    Souscription,
    StatutCampagne,
    StatutJustificatif,
    StatutSouscription,
)

# FDD §4.2/§9 : "PDF ou image, max 5 Mo" — validation MIME réelle (magic bytes, jamais
# l'extension/Content-Type déclarés par le client), même principe que
# apps.membres.import_views.ALLOWED_MIME_TYPES. La map mime -> extension sert aussi à
# reconstruire un nom de fichier serveur sûr (voir validate_fichier ci-dessous).
ALLOWED_JUSTIFICATIF_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
}
MAX_JUSTIFICATIF_SIZE_BYTES = 5 * 1024 * 1024


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
            "icone",
            "couleur",
            "populaire",
            "rabais",
        ]
        read_only_fields = ["id"]

    def validate_icone(self, image):
        # Retour utilisateur du 2026-09-29 : "Icons für jede Angebotskachel hochladen" — même
        # validation (MIME réel, redimensionnement, ré-encodage) que toute image uploadée par
        # un membre, voir le docstring de valider_et_reencoder_photo.
        return valider_et_reencoder_photo(image)


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


class JustificatifRabaisSerializer(serializers.ModelSerializer):
    """
    Vue complète (RH+/propriétaire — voir permissions.JustificatifPermission), et forme
    nichée en lecture seule sur SouscriptionSerializer (champ `justificatif` ci-dessous) :
    volontairement SANS `fichier` — un chemin d'objet MinIO brut ne doit jamais transiter
    par une réponse JSON générique (FDD §9 "jamais d'URL publique permanente"). Le fichier
    ne s'obtient que via l'action dédiée `telecharger`, qui renvoie une URL pré-signée à
    courte durée de vie (voir views.py, storage.py).
    """

    class Meta:
        model = JustificatifRabais
        fields = [
            "id",
            "souscription",
            "type_justificatif",
            "statut",
            "valide_par",
            "date_decision",
            "motif_rejet",
            "created_at",
        ]
        read_only_fields = fields


class SouscriptionSerializer(serializers.ModelSerializer):
    # Lecture seule : permet au membre de connaître le statut/motif de rejet de son
    # justificatif directement depuis mes-souscriptions/, sans appel séparé (AHM-20).
    # None tant qu'aucun justificatif n'a été uploadé pour cette souscription.
    justificatif = JustificatifRabaisSerializer(read_only=True)

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
            "justificatif",
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


class SouscrireEspecesSerializer(serializers.Serializer):
    """Entrée de l'action `souscrire-especes` (ajoutée le 2026-09-21, retour utilisateur :
    "Füge mitgliedschaftsbeitrag hinzu mit den aktuellen Angebote", dans le formulaire
    "Barzahlung eintragen" de CotisationsEnAttentePage) — réservée au Directeur Financier/Admin
    App, mêmes principes que SouscrireSerializer plus `membre` explicite (saisie pour autrui,
    F-015, même schéma que InscrireEspecesSerializer côté apps.evenements).

    Pas de champ `rabais` ici volontairement : un rabais nécessite un justificatif validé par
    RH avant paiement (FDD §4.2), un parcours incompatible avec une saisie immédiate en
    espèces au guichet — un membre souhaitant un rabais reste sur le parcours libre-service
    normal (souscrire()/JustificatifRabaisViewSet)."""

    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())
    offre = serializers.PrimaryKeyRelatedField(queryset=OffreAdhesion.objects.all())

    def validate(self, attrs):
        offre = attrs["offre"]
        membre = attrs["membre"]

        if not offre.visible:
            raise serializers.ValidationError({"offre": "Cette offre n'est plus disponible."})
        if offre.campagne.statut != StatutCampagne.PUBLIEE:
            raise serializers.ValidationError(
                {"offre": "La campagne de cette offre n'est pas ouverte aux souscriptions."}
            )
        if not offre.eligible_pour_age(membre.age):
            raise serializers.ValidationError(
                {"offre": "Ce membre ne remplit pas la condition d'âge de cette offre."}
            )

        return attrs


class JustificatifRabaisUploadSerializer(serializers.ModelSerializer):
    """
    Entrée de POST /adhesions/justificatifs/ (multipart/form-data) — voir
    JustificatifRabaisViewSet.create pour la logique de remplacement d'un justificatif
    déjà uploadé mais pas encore tranché (souscription <-> justificatif est en
    OneToOneField, voir models.py).
    """

    class Meta:
        model = JustificatifRabais
        fields = ["souscription", "fichier", "type_justificatif"]
        # `souscription` est un OneToOneField -> DRF y ajoute par défaut un
        # UniqueValidator qui rejetterait TOUT ré-upload, y compris le cas légitime
        # (justificatif existant encore "en_attente") géré explicitement par validate()
        # ci-dessous et par la logique de remplacement dans JustificatifRabaisViewSet.
        # create. On désactive ce validateur générique au profit du contrôle métier.
        extra_kwargs = {"souscription": {"validators": []}}

    def validate_fichier(self, fichier):
        if fichier.size > MAX_JUSTIFICATIF_SIZE_BYTES:
            raise serializers.ValidationError(
                f"Fichier trop volumineux (max {MAX_JUSTIFICATIF_SIZE_BYTES // (1024 * 1024)} Mo)."
            )
        # Lecture complète nécessaire pour une détection fiable des magic bytes (même
        # raisonnement que apps.membres.import_views pour les .xlsx) — bornée par la
        # vérification de taille ci-dessus.
        contenu = fichier.read()
        fichier.seek(0)
        mime_reel = magic.from_buffer(contenu, mime=True)
        extension = ALLOWED_JUSTIFICATIF_MIME_TYPES.get(mime_reel)
        if extension is None:
            raise serializers.ValidationError(
                f"Format non supporté (détecté : {mime_reel}). PDF, JPEG ou PNG uniquement."
            )
        # Nom de fichier reconstruit côté serveur à partir du type réellement détecté —
        # jamais le nom/l'extension fournis par le client (SCD §7.4, path traversal /
        # extension trompeuse). Voir models.justificatif_upload_path pour le préfixe.
        fichier.name = f"{uuid.uuid4()}.{extension}"
        return fichier

    def validate_souscription(self, souscription):
        # RH+ peut uploader un justificatif pour le compte d'un membre (demande utilisateur du
        # 2026-09-16, "Inklusive das hochladen des Beweisdokumentes beim Rabatt-Vorteil") : dans
        # ce cas, `membre` (le membre RH lui-même, pas nécessairement le propriétaire de la
        # souscription) n'a pas à correspondre à souscription.membre_id — voir
        # JustificatifRabaisViewSet.create pour le calcul de est_rh_plus.
        if not self.context.get("est_rh_plus", False):
            membre = self.context["membre"]
            if souscription.membre_id != membre.id:
                raise serializers.ValidationError("Cette souscription ne vous appartient pas.")
        if souscription.statut != StatutSouscription.EN_ATTENTE_JUSTIFICATIF:
            raise serializers.ValidationError(
                "Cette souscription n'est pas en attente de justificatif."
            )
        return souscription

    def validate(self, attrs):
        existant = getattr(attrs["souscription"], "justificatif", None)
        if existant is not None and existant.statut != StatutJustificatif.EN_ATTENTE:
            raise serializers.ValidationError(
                {"souscription": "Un justificatif a déjà été traité pour cette souscription."}
            )
        return attrs


class ValiderJustificatifSerializer(serializers.Serializer):
    """Entrée de POST /adhesions/justificatifs/{id}/valider/ — RH+ (voir permissions.py)."""

    decision = serializers.ChoiceField(choices=["approuve", "rejete"])
    motif_rejet = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if attrs["decision"] == "rejete" and not attrs["motif_rejet"].strip():
            raise serializers.ValidationError(
                {"motif_rejet": "Un motif de rejet est obligatoire en cas de refus (FDD §4.2)."}
            )
        return attrs

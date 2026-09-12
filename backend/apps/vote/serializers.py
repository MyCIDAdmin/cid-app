"""
Serializers — app vote.

`anonymat_sel` n'apparaît dans AUCUN serializer — il n'est jamais exposé à l'API, sous
aucune forme (SCD §7.5). VoteSessionCreateSerializer accepte les options en écriture
imbriquée (mockup wizard step 1+2 soumis en une seule requête, cf FDD F-008 "wizard 3
étapes" — la confirmation de l'étape 3 déclenche un unique POST récapitulatif)."""

from rest_framework import serializers

from .models import TypeVote, VoteOption, VoteSession
from .services import membres_eligibles_qs, nombre_participants


class VoteOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = VoteOption
        fields = ["id", "label", "description", "ordre"]
        read_only_fields = ["id"]


class VoteSessionSerializer(serializers.ModelSerializer):
    options = VoteOptionSerializer(many=True, read_only=True)
    total_participants = serializers.SerializerMethodField()
    total_eligibles = serializers.SerializerMethodField()
    resultats_visibles = serializers.BooleanField(read_only=True)

    class Meta:
        model = VoteSession
        fields = [
            "id",
            "titre",
            "description",
            "type_vote",
            "mode_anonymat",
            "nb_choix_max",
            "eligibilite",
            "duree_minutes",
            "quorum_pct",
            "statut",
            "date_ouverture",
            "date_fin",
            "date_cloture",
            "options",
            "total_participants",
            "total_eligibles",
            "resultats_visibles",
            "created_by",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "statut",
            "date_ouverture",
            "date_fin",
            "date_cloture",
            "created_by",
            "created_at",
        ]

    def get_total_participants(self, obj) -> int:
        return nombre_participants(obj)

    def get_total_eligibles(self, obj) -> int:
        return membres_eligibles_qs(obj).count()


class VoteSessionCreateSerializer(serializers.ModelSerializer):
    """Étapes 1+2+3 du wizard admin en un seul POST (RICEFW W-006 : lancement immédiat)."""

    options = VoteOptionSerializer(many=True, write_only=True)

    class Meta:
        model = VoteSession
        fields = [
            "titre",
            "description",
            "type_vote",
            "mode_anonymat",
            "nb_choix_max",
            "eligibilite",
            "membres_selectionnes",
            "duree_minutes",
            "quorum_pct",
            "resultats_visibles_avant_cloture",
            "options",
        ]

    def validate(self, attrs):
        options = attrs.get("options") or []
        if len(options) < 2:
            raise serializers.ValidationError(
                {"options": "Un vote doit comporter au moins 2 options (FDD F-008)."}
            )
        type_vote = attrs.get("type_vote")
        if type_vote == TypeVote.OUI_NON and len(options) != 3:
            # Oui / Non / Abstention — mockup renderBallot('yesno') génère ces 3 options
            # côté frontend ; côté backend on les exige explicitement pour rester
            # cohérent avec le modèle de comptage (chaque option est une VoteOption réelle).
            raise serializers.ValidationError(
                {"options": "Un vote Oui/Non attend exactement 3 options (Oui, Non, Abstention)."}
            )
        eligibilite = attrs.get("eligibilite")
        if eligibilite == "selection_manuelle" and not attrs.get("membres_selectionnes"):
            raise serializers.ValidationError(
                {"membres_selectionnes": "Requis lorsque eligibilite=selection_manuelle."}
            )
        return attrs


class BulletinSubmitSerializer(serializers.Serializer):
    """Format du message WebSocket `{"type": "voter", "choix": [...]}` — validé par le
    consumer avant tout accès base (voir consumers.py)."""

    choix = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=50)


class ResultatsSerializer(serializers.Serializer):
    """Miroir du dict retourné par services.calculer_resultats — sert uniquement de
    documentation/contrat de schéma (la vue renvoie directement le dict, déjà agrégé)."""

    session_id = serializers.UUIDField()
    statut = serializers.CharField()
    total_participants = serializers.IntegerField()
    total_eligibles = serializers.IntegerField()
    taux_participation = serializers.FloatField()
    quorum_requis = serializers.IntegerField(allow_null=True)
    quorum_atteint = serializers.BooleanField()

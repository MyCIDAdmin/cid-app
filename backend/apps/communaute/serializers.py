"""Serializers — app communaute, lot Fil d'actualité + Forum."""

from rest_framework import serializers

from apps.membres.models import Membre

from .models import (
    Commentaire,
    Conversation,
    GroupeChat,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    Publication,
    PublicationLike,
    PublicationPartage,
    ReponseForum,
    Sujet,
)


class AuteurSerializer(serializers.ModelSerializer):
    """Représentation légère d'un membre — auteur d'une publication/d'un sujet/d'une
    réponse. Volontairement minimale (pas d'email, pas de rôle) : ce contenu est visible
    par tout membre authentifié, contrairement à la fiche membre complète."""

    class Meta:
        model = Membre
        fields = ["id", "prenom", "nom", "photo"]


class CommentaireSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)
    reponses = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = Commentaire
        fields = [
            "id",
            "publication",
            "parent",
            "auteur",
            "contenu",
            "est_masque",
            "created_at",
            "reponses",
            "est_auteur",
        ]
        read_only_fields = ["id", "est_masque", "created_at"]

    def get_est_auteur(self, obj) -> bool:
        # Utilisé par le frontend pour n'afficher "Supprimer" que sur son propre commentaire
        # (le backend reste seul juge — voir ContenuCommunautePermission — ce champ n'est
        # qu'un confort d'affichage, jamais une autorisation).
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.auteur_id == membre.id

    def get_reponses(self, obj):
        # Un seul niveau de nesting (voir docstring modèle) — pas de récursion plus
        # profonde, les réponses elles-mêmes n'ont pas de champ "reponses" ici.
        if obj.parent_id is not None:
            return []
        qs = obj.reponses.filter(est_masque=False).select_related("auteur")
        return CommentaireSerializer(qs, many=True, context=self.context).data

    def create(self, validated_data):
        membre = self.context["request"].user.membre
        validated_data["auteur"] = membre
        return super().create(validated_data)


class PublicationSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)
    hashtags = serializers.SlugRelatedField(slug_field="label", many=True, read_only=True)
    nombre_likes = serializers.IntegerField(source="likes.count", read_only=True)
    nombre_partages = serializers.IntegerField(source="partages.count", read_only=True)
    nombre_commentaires = serializers.SerializerMethodField()
    jaime = serializers.SerializerMethodField()
    jai_partage = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()
    commentaires = serializers.SerializerMethodField()

    class Meta:
        model = Publication
        fields = [
            "id",
            "auteur",
            "contenu",
            "image",
            "hashtags",
            "est_masquee",
            "motif_masquage",
            "created_at",
            "updated_at",
            "nombre_likes",
            "nombre_partages",
            "nombre_commentaires",
            "jaime",
            "jai_partage",
            "est_auteur",
            "commentaires",
        ]
        read_only_fields = ["id", "est_masquee", "motif_masquage", "created_at", "updated_at"]

    def get_nombre_commentaires(self, obj) -> int:
        return obj.commentaires.filter(est_masque=False).count()

    def _membre_courant(self):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        return getattr(request.user, "membre", None)

    def get_jaime(self, obj) -> bool:
        membre = self._membre_courant()
        return membre is not None and obj.likes.filter(membre=membre).exists()

    def get_jai_partage(self, obj) -> bool:
        membre = self._membre_courant()
        return membre is not None and obj.partages.filter(membre=membre).exists()

    def get_est_auteur(self, obj) -> bool:
        membre = self._membre_courant()
        return membre is not None and obj.auteur_id == membre.id

    def get_commentaires(self, obj):
        # Seulement les commentaires racine (les réponses sont nichées dedans, voir
        # CommentaireSerializer.get_reponses) — évite de lister deux fois les réponses.
        qs = obj.commentaires.filter(parent__isnull=True, est_masque=False).select_related("auteur")
        return CommentaireSerializer(qs, many=True, context=self.context).data

    def create(self, validated_data):
        membre = self.context["request"].user.membre
        validated_data["auteur"] = membre
        publication = super().create(validated_data)
        publication.synchroniser_hashtags()
        return publication

    def update(self, instance, validated_data):
        publication = super().update(instance, validated_data)
        if "contenu" in validated_data:
            publication.synchroniser_hashtags()
        return publication


class PublicationLikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicationLike
        fields = ["id", "publication", "membre", "created_at"]
        read_only_fields = fields


class PublicationPartageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PublicationPartage
        fields = ["id", "publication", "membre", "created_at"]
        read_only_fields = fields


class ReponseForumSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = ReponseForum
        fields = ["id", "sujet", "auteur", "contenu", "est_masquee", "created_at", "est_auteur"]
        read_only_fields = ["id", "est_masquee", "created_at"]

    def get_est_auteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.auteur_id == membre.id

    def create(self, validated_data):
        membre = self.context["request"].user.membre
        validated_data["auteur"] = membre
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Messagerie privée + Groupes de chat
# ---------------------------------------------------------------------------


class ConversationSerializer(serializers.ModelSerializer):
    """REST = historique uniquement (liste des conversations + aperçu) ; l'envoi d'un
    message passe exclusivement par `MessagerieConsumer` (voir docstring modèle)."""

    autre_participant = serializers.SerializerMethodField()
    dernier_message = serializers.SerializerMethodField()
    nombre_non_lus = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "autre_participant",
            "dernier_message",
            "nombre_non_lus",
            "created_at",
        ]
        read_only_fields = fields

    def _membre_courant(self):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        return getattr(request.user, "membre", None)

    def get_autre_participant(self, obj):
        membre = self._membre_courant()
        if membre is None:
            return None
        return AuteurSerializer(obj.autre_participant(membre)).data

    def get_dernier_message(self, obj):
        dernier = obj.messages.order_by("-created_at").first()
        if dernier is None:
            return None
        return {
            "contenu": dernier.contenu,
            "expediteur": dernier.expediteur_id,
            "created_at": dernier.created_at,
            "est_lu": dernier.est_lu,
        }

    def get_nombre_non_lus(self, obj) -> int:
        membre = self._membre_courant()
        if membre is None:
            return 0
        return obj.messages.filter(est_lu=False).exclude(expediteur_id=membre.id).count()


class MessagePriveSerializer(serializers.ModelSerializer):
    """Liste seule (voir vue) — l'envoi passe par le WebSocket. `contenu` est déchiffré
    automatiquement à la lecture par `EncryptedTextField` (transparent pour DRF, comme
    `Membre.cin` — voir apps.membres.serializers)."""

    est_expediteur = serializers.SerializerMethodField()

    class Meta:
        model = MessagePrive
        fields = [
            "id",
            "conversation",
            "expediteur",
            "contenu",
            "est_lu",
            "lu_le",
            "created_at",
            "est_expediteur",
        ]
        read_only_fields = fields

    def get_est_expediteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.expediteur_id == membre.id


class MembreGroupeSerializer(serializers.ModelSerializer):
    membre = AuteurSerializer(read_only=True)

    class Meta:
        model = MembreGroupe
        fields = ["id", "groupe", "membre", "created_at"]
        read_only_fields = fields


class GroupeChatSerializer(serializers.ModelSerializer):
    createur = AuteurSerializer(read_only=True)
    nombre_membres = serializers.IntegerField(source="membres_groupe.count", read_only=True)
    est_membre = serializers.SerializerMethodField()
    # Écriture seule, utilisé uniquement à la création d'un groupe privé (voir mockup
    # "Créer un groupe de chat" — cases "Membres à inviter") ; ignoré pour un groupe public.
    membres_invites = serializers.PrimaryKeyRelatedField(
        queryset=Membre.objects.all(), many=True, write_only=True, required=False
    )

    class Meta:
        model = GroupeChat
        fields = [
            "id",
            "nom",
            "description",
            "type_groupe",
            "createur",
            "created_at",
            "nombre_membres",
            "est_membre",
            "membres_invites",
        ]
        read_only_fields = ["id", "createur", "created_at", "nombre_membres", "est_membre"]

    def get_est_membre(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.membres_groupe.filter(membre=membre).exists()

    def create(self, validated_data):
        membres_invites = validated_data.pop("membres_invites", [])
        createur = self.context["request"].user.membre
        validated_data["createur"] = createur
        groupe = super().create(validated_data)
        MembreGroupe.objects.create(groupe=groupe, membre=createur)
        if groupe.type_groupe == "prive":
            for membre in membres_invites:
                if membre.id != createur.id:
                    MembreGroupe.objects.get_or_create(groupe=groupe, membre=membre)
        return groupe


class MessageGroupeSerializer(serializers.ModelSerializer):
    """Liste seule (voir vue) — l'envoi passe par le WebSocket (`GroupeChatConsumer`)."""

    auteur = AuteurSerializer(read_only=True)
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = MessageGroupe
        fields = ["id", "groupe", "auteur", "contenu", "created_at", "est_auteur"]
        read_only_fields = fields

    def get_est_auteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.auteur_id == membre.id


class SujetSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)
    nombre_reponses = serializers.IntegerField(read_only=True)
    reponses = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()

    class Meta:
        model = Sujet
        fields = [
            "id",
            "auteur",
            "categorie",
            "titre",
            "contenu",
            "est_epingle",
            "est_verrouille",
            "est_masque",
            "motif_masquage",
            "created_at",
            "updated_at",
            "nombre_reponses",
            "reponses",
            "est_auteur",
        ]
        read_only_fields = [
            "id",
            "est_epingle",
            "est_verrouille",
            "est_masque",
            "motif_masquage",
            "created_at",
            "updated_at",
        ]

    def get_est_auteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.auteur_id == membre.id

    def get_reponses(self, obj):
        # Chargées uniquement sur le détail (retrieve) — voir views.SujetViewSet.get_serializer
        # qui n'inclut ce champ que pour l'action "retrieve" (liste = aperçu léger).
        if self.context.get("vue") != "detail":
            return []
        qs = obj.reponses.filter(est_masquee=False).select_related("auteur")
        return ReponseForumSerializer(qs, many=True, context=self.context).data

    def create(self, validated_data):
        membre = self.context["request"].user.membre
        validated_data["auteur"] = membre
        return super().create(validated_data)

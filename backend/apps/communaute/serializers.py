"""Serializers — app communaute, tous les lots (Fil d'actualité + Forum ; Messagerie +
Groupes ; Live Match + Albums + Quiz — Phase 4B, voir docstring de tête models.py)."""

from django.db.models import Count
from rest_framework import serializers

from apps.accounts.models import ROLE_LEVELS
from apps.membres.models import Membre

from .models import (
    Album,
    ChoixQuestion,
    Commentaire,
    Conversation,
    GroupeChat,
    Match,
    MatchCommentaire,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    ParticipationQuiz,
    Photo,
    PhotoCommentaire,
    PhotoLike,
    Publication,
    PublicationLike,
    PublicationPartage,
    Quiz,
    QuestionQuiz,
    ReponseForum,
    ReponseQuiz,
    Sujet,
    TypeReactionMatch,
)
from .permissions import MODERATION_MIN_LEVEL
from .validators import valider_document_pdf, valider_et_reencoder_photo


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
            "document",
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

    def validate_image(self, image):
        # Ajouté le 2026-09-20 (retour utilisateur : "wenn ich ein Bild an einer Neuigkeit
        # anhänge, wird das Bild nach dem Veröffentlichen nicht angezeigt") — jusqu'ici
        # `Publication.image` ne passait par AUCUNE validation MIME/ré-encodage
        # (contrairement à `Photo.image`, voir `validate_image` plus bas dans ce même
        # fichier), en violation de CLAUDE.md §8 : le fichier brut du client (nom/extension
        # arbitraires, Content-Type non garanti) était stocké et servi tel quel — un nom de
        # fichier sans extension reconnue fait typiquement deviner à MinIO un
        # Content-Type générique (`application/octet-stream`), que le navigateur refuse
        # d'afficher dans un `<img>` (icône cassée), ce qui correspond exactement au
        # symptôme rapporté. Même fonction que pour les photos d'album : reconstruit un
        # nom de fichier serveur avec la vraie extension détectée, ce qui garantit un
        # Content-Type image/* correct en plus de fermer l'écart de sécurité.
        return valider_et_reencoder_photo(image)

    def validate_document(self, document):
        return valider_document_pdf(document)

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
    # Utilisé par le frontend pour n'afficher "Supprimer le groupe" qu'au créateur (demande
    # utilisateur du 2026-09-16, "Besprechungen ... vom Ersteller gelöscht werden") — même
    # principe de confort d'affichage que est_auteur/est_expediteur ailleurs dans ce module,
    # le backend reste seul juge (voir GroupeChatPermission.has_object_permission).
    est_createur = serializers.SerializerMethodField()
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
            "est_createur",
            "membres_invites",
        ]
        read_only_fields = [
            "id",
            "createur",
            "created_at",
            "nombre_membres",
            "est_membre",
            "est_createur",
        ]

    def get_est_membre(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.membres_groupe.filter(membre=membre).exists()

    def get_est_createur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.createur_id == membre.id

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


# ---------------------------------------------------------------------------
# Live Match (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------


class MatchSerializer(serializers.ModelSerializer):
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = [
            "id",
            "adversaire",
            "competition",
            "lieu",
            "date_heure",
            "statut",
            "score_ca",
            "score_adversaire",
            "minute_chrono",
            "created_at",
            "updated_at",
            "reactions",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_reactions(self, obj) -> dict:
        # Agrégat par emoji — toutes les clés de TypeReactionMatch sont présentes même à 0,
        # pour un affichage stable côté frontend (les boutons de réaction n'apparaissent pas
        # seulement après le premier clic d'un membre).
        compteurs = {valeur: 0 for valeur, _label in TypeReactionMatch.choices}
        for ligne in obj.reactions.values("emoji").annotate(total=Count("id")):
            compteurs[ligne["emoji"]] = ligne["total"]
        return compteurs

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class MatchCommentaireSerializer(serializers.ModelSerializer):
    """Liste seule (voir vue) — l'envoi passe exclusivement par `LiveMatchConsumer`."""

    auteur = AuteurSerializer(read_only=True)

    class Meta:
        model = MatchCommentaire
        fields = ["id", "match", "auteur", "contenu", "created_at"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Albums photos (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------


class AlbumSerializer(serializers.ModelSerializer):
    createur = AuteurSerializer(read_only=True)
    nombre_photos = serializers.IntegerField(read_only=True)
    # SerializerMethodField (donc en LECTURE SEULE, jamais généré comme PrimaryKeyRelatedField
    # writable) : aucun écran ne permet encore de choisir un événement à la création d'un
    # album (le mockup #m-photo ne propose qu'un sélecteur d'ALBUM existant, pas de lien vers
    # apps.evenements) — accepter un id brut en écriture ici a précédemment permis d'envoyer
    # n'importe quel texte de formulaire (ex. "Album") comme si c'était un UUID, provoquant
    # une 400 "n'est pas un UUID valide" (bug remonté en test manuel Phase 4). En lecture, on
    # renvoie {id, titre} plutôt que l'UUID brut — seul moyen d'afficher un nom lisible.
    # Reste modifiable via l'admin Django tant qu'aucune UI de liaison n'existe.
    evenement = serializers.SerializerMethodField()

    class Meta:
        model = Album
        fields = [
            "id",
            "nom",
            "description",
            "date",
            "lieu",
            "evenement",
            "createur",
            "created_at",
            "nombre_photos",
        ]
        read_only_fields = ["id", "createur", "created_at", "nombre_photos"]

    def get_evenement(self, obj):
        if not obj.evenement_id:
            return None
        return {"id": str(obj.evenement_id), "titre": obj.evenement.titre}

    def create(self, validated_data):
        validated_data["createur"] = self.context["request"].user.membre
        return super().create(validated_data)


class PhotoCommentaireSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)

    class Meta:
        model = PhotoCommentaire
        fields = ["id", "photo", "auteur", "contenu", "created_at"]
        read_only_fields = ["id", "auteur", "created_at"]

    def create(self, validated_data):
        validated_data["auteur"] = self.context["request"].user.membre
        return super().create(validated_data)


class PhotoLikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PhotoLike
        fields = ["id", "photo", "membre", "created_at"]
        read_only_fields = fields


class PhotoSerializer(serializers.ModelSerializer):
    membre = AuteurSerializer(read_only=True)
    nombre_likes = serializers.IntegerField(source="likes.count", read_only=True)
    jaime = serializers.SerializerMethodField()
    est_proprietaire = serializers.SerializerMethodField()
    commentaires = PhotoCommentaireSerializer(many=True, read_only=True)

    class Meta:
        model = Photo
        fields = [
            "id",
            "album",
            "membre",
            "image",
            "legende",
            "est_masquee",
            "created_at",
            "nombre_likes",
            "jaime",
            "est_proprietaire",
            "commentaires",
        ]
        read_only_fields = ["id", "membre", "est_masquee", "created_at"]

    def _membre_courant(self):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        return getattr(request.user, "membre", None)

    def get_jaime(self, obj) -> bool:
        membre = self._membre_courant()
        return membre is not None and obj.likes.filter(membre=membre).exists()

    def get_est_proprietaire(self, obj) -> bool:
        membre = self._membre_courant()
        return membre is not None and obj.membre_id == membre.id

    def validate_image(self, image):
        # Validation MIME réelle + ré-encodage Pillow (bombe de décompression, EXIF) — voir
        # docstring de `valider_et_reencoder_photo` (CID-SCD-001 §7.4).
        return valider_et_reencoder_photo(image)

    def create(self, validated_data):
        validated_data["membre"] = self.context["request"].user.membre
        return super().create(validated_data)


# ---------------------------------------------------------------------------
# Quiz (troisième lot — Phase 4B)
# ---------------------------------------------------------------------------


class ChoixQuestionSerializer(serializers.ModelSerializer):
    """`est_correct` est retiré de la représentation en lecture pour tout membre qui n'est
    pas Bureau Admin+ (voir `to_representation`) — jamais exposé avant réponse, pour ne pas
    permettre de deviner la bonne réponse en inspectant la requête réseau (voir docstring de
    tête models.py). Le champ reste accepté en ÉCRITURE (création/édition d'une question par
    un admin, seul cas où `QuizPermission` autorise ces actions)."""

    class Meta:
        model = ChoixQuestion
        fields = ["id", "question", "texte", "est_correct"]
        read_only_fields = ["id"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None
        est_admin = bool(
            user and user.is_authenticated and ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        )
        if not est_admin:
            data.pop("est_correct", None)
        return data


class QuestionQuizSerializer(serializers.ModelSerializer):
    choix = ChoixQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = QuestionQuiz
        fields = ["id", "quiz", "texte", "ordre", "points", "choix"]
        read_only_fields = ["id"]


class ParticipationQuizSerializer(serializers.ModelSerializer):
    membre = AuteurSerializer(read_only=True)
    temps_total_secondes = serializers.FloatField(read_only=True)

    class Meta:
        model = ParticipationQuiz
        fields = [
            "id",
            "quiz",
            "membre",
            "score",
            "demarree_le",
            "terminee_le",
            "temps_total_secondes",
        ]
        read_only_fields = fields


class ReponseQuizSerializer(serializers.ModelSerializer):
    """Réponse déjà tranchée par le serveur (voir `QuizViewSet.repondre`) — purement en
    lecture, jamais créée directement via ce serializer (`est_correct`/`points_obtenus` ne
    doivent jamais être acceptés depuis le client, voir docstring de tête models.py)."""

    class Meta:
        model = ReponseQuiz
        fields = [
            "id",
            "participation",
            "question",
            "choix",
            "est_correct",
            "points_obtenus",
            "created_at",
        ]
        read_only_fields = fields


class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionQuizSerializer(many=True, read_only=True)
    nombre_questions = serializers.IntegerField(source="questions.count", read_only=True)
    ma_participation = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = [
            "id",
            "titre",
            "description",
            "est_actif",
            "created_at",
            "questions",
            "nombre_questions",
            "ma_participation",
        ]
        read_only_fields = ["id", "created_at"]

    def get_ma_participation(self, obj):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return None
        membre = getattr(request.user, "membre", None)
        if membre is None:
            return None
        participation = obj.participations.filter(membre=membre).first()
        if participation is None:
            return None
        return ParticipationQuizSerializer(participation, context=self.context).data

    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)

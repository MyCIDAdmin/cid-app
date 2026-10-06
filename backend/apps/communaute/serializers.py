"""Serializers — app communaute, tous les lots (Fil d'actualité + Forum ; Messagerie +
Groupes ; Live Match + Albums + Quiz — Phase 4B, voir docstring de tête models.py)."""

from datetime import timedelta

from django.db.models import Count
from django.utils import timezone as django_timezone
from rest_framework import serializers

from apps.accounts.models import ROLE_LEVELS
from apps.membres.models import Membre, StatutMembre
from apps.uebersetzung.serializers import UebersetzungenField

from .models import (
    MODULES_AVEC_ARRIERE_PLAN,
    Album,
    ArrierePlanModule,
    ChoixQuestion,
    ClassementLigue,
    Commentaire,
    ConfigurationSitePublic,
    Conversation,
    EquipeInfo,
    EquipeLogo,
    GroupeChat,
    Match,
    MatchCommentaire,
    MatchEvenement,
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
    QuestionQuiz,
    Quiz,
    RencontreCalendrier,
    ReponseForum,
    ReponseQuiz,
    StatistiqueJoueur,
    StatutRencontre,
    Sujet,
    Tippspiel,
    TippspielPrix,
    TippspielTeilnahme,
    TippspielTip,
    TypePrixTippspiel,
    TypeReactionMatch,
    extraire_mentions,
)
from .notifications import notifier_mentions
from .permissions import MODERATION_MIN_LEVEL
from .validators import (
    valider_document_pdf,
    valider_et_reencoder_photo,
    valider_media_kachel,
    valider_video_hero,
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
    # Ajouté le 2026-09-29 (demande utilisateur : "'@'-Erwähnungen auf weitere Module wie
    # Forum/Neuigkeiten ausweiten und mit echten Benachrichtigungen versehen") — le champ de
    # commentaire est un simple <input type="text"> (pas de TipTap), donc le frontend transmet
    # explicitement les membres choisis dans le picker "@" plutôt que de parser le texte
    # (aucune ambiguïté nom→membre). `queryset` restreint aux membres actifs = même validation
    # que MembreRechercheViewSet, un ID inconnu/inactif est rejeté avec une 400 par DRF.
    # write_only et absent du modèle : extrait dans create() ci-dessous, jamais persisté tel
    # quel — voir CommentaireViewSet.perform_create pour l'envoi de la notification.
    mentions = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        queryset=Membre.objects.filter(statut=StatutMembre.ACTIF),
    )

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
            "mentions",
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
        # "mentions" n'est pas un champ du modèle Commentaire — retiré de la copie locale
        # avant Model.objects.create(**validated_data) ; self.validated_data (l'attribut,
        # jamais modifié par ce pop) reste lisible depuis la vue après serializer.save().
        validated_data.pop("mentions", None)
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
            "important",
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
        self._notifier_mentions(publication)
        return publication

    def update(self, instance, validated_data):
        publication = super().update(instance, validated_data)
        if "contenu" in validated_data:
            publication.synchroniser_hashtags()
            self._notifier_mentions(publication)
        return publication

    def _notifier_mentions(self, publication) -> None:
        # Mentions "@" (ajoutées le 2026-09-29) — voir extraire_mentions dans models.py pour
        # le format du nœud TipTap. Résolution en Membres réellement actifs ici (jamais fait
        # confiance aux data-id bruts du HTML — un membre a pu être désactivé depuis la
        # rédaction, ou l'attribut peut être falsifié côté client), même garde-fou que le
        # queryset de CommentaireSerializer.mentions ci-dessus.
        ids = extraire_mentions(publication.contenu)
        if not ids:
            return
        membres = Membre.objects.filter(id__in=ids, statut=StatutMembre.ACTIF)
        if membres:
            notifier_mentions(publication, membres)


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
    # Voir CommentaireSerializer.mentions ci-dessus — même mécanisme (champ texte libre, pas
    # de TipTap).
    mentions = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        queryset=Membre.objects.filter(statut=StatutMembre.ACTIF),
    )

    class Meta:
        model = ReponseForum
        fields = [
            "id",
            "sujet",
            "auteur",
            "contenu",
            "est_masquee",
            "created_at",
            "est_auteur",
            "mentions",
        ]
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
        validated_data.pop("mentions", None)  # voir CommentaireSerializer.create
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


class MessagePriveApercuSerializer(serializers.ModelSerializer):
    """Aperçu minimal d'un message privé cité par une réponse (demande utilisateur
    2026-09-25, "antworten") — pas de `est_lu`/`lu_le` ni d'autre champ que ceux
    nécessaires à afficher la citation dans la bulle."""

    expediteur = AuteurSerializer(read_only=True)

    class Meta:
        model = MessagePrive
        fields = ["id", "expediteur", "contenu"]


class MessagePriveSerializer(serializers.ModelSerializer):
    """Liste seule (voir vue) — l'envoi passe par le WebSocket. `contenu` est déchiffré
    automatiquement à la lecture par `EncryptedTextField` (transparent pour DRF, comme
    `Membre.cin` — voir apps.membres.serializers)."""

    est_expediteur = serializers.SerializerMethodField()
    nombre_likes = serializers.IntegerField(source="likes.count", read_only=True)
    jaime = serializers.SerializerMethodField()
    repond_a_detail = MessagePriveApercuSerializer(source="repond_a", read_only=True)

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
            "nombre_likes",
            "jaime",
            "repond_a",
            "repond_a_detail",
        ]
        read_only_fields = fields

    def get_est_expediteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.expediteur_id == membre.id

    def get_jaime(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.likes.filter(membre=membre).exists()


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


class MessageGroupeApercuSerializer(serializers.ModelSerializer):
    """Aperçu minimal d'un message de groupe cité par une réponse — voir
    MessagePriveApercuSerializer ci-dessus."""

    auteur = AuteurSerializer(read_only=True)

    class Meta:
        model = MessageGroupe
        fields = ["id", "auteur", "contenu"]


class MessageGroupeSerializer(serializers.ModelSerializer):
    """Liste seule (voir vue) — l'envoi passe par le WebSocket (`GroupeChatConsumer`)."""

    auteur = AuteurSerializer(read_only=True)
    est_auteur = serializers.SerializerMethodField()
    nombre_likes = serializers.IntegerField(source="likes.count", read_only=True)
    jaime = serializers.SerializerMethodField()
    repond_a_detail = MessageGroupeApercuSerializer(source="repond_a", read_only=True)

    class Meta:
        model = MessageGroupe
        fields = [
            "id",
            "groupe",
            "auteur",
            "contenu",
            "created_at",
            "est_auteur",
            "nombre_likes",
            "jaime",
            "repond_a",
            "repond_a_detail",
        ]
        read_only_fields = fields

    def get_est_auteur(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.auteur_id == membre.id

    def get_jaime(self, obj) -> bool:
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        membre = getattr(request.user, "membre", None)
        return membre is not None and obj.likes.filter(membre=membre).exists()


class SujetSerializer(serializers.ModelSerializer):
    auteur = AuteurSerializer(read_only=True)
    nombre_reponses = serializers.IntegerField(read_only=True)
    reponses = serializers.SerializerMethodField()
    est_auteur = serializers.SerializerMethodField()
    # Voir CommentaireSerializer.mentions ci-dessus — même mécanisme (champ texte libre, pas
    # de TipTap).
    mentions = serializers.PrimaryKeyRelatedField(
        many=True,
        write_only=True,
        required=False,
        queryset=Membre.objects.filter(statut=StatutMembre.ACTIF),
    )

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
            "mentions",
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
        validated_data.pop("mentions", None)  # voir CommentaireSerializer.create
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
# Fan-Club — extension du Live Match (2026-09-24, voir docstring de tête models.py)
# ---------------------------------------------------------------------------


class ClassementLigueSerializer(serializers.ModelSerializer):
    """Lecture seule — toujours synchronisé depuis GOAL API, voir services.py.

    `forme_recente` (2026-10-06, "Spalte Form ist leer") : GOAL API ne l'expose pas sur
    l'endpoint standings. Elle est donc DÉDUITE des rencontres terminées en base
    (`RencontreCalendrier`, calendrier de l'équipe suivie) : cinq derniers résultats V/N/D, le
    plus récent en dernier. Une équipe n'est renseignée que si la base couvre toutes ses
    cinq dernières rencontres (sinon une forme partielle, p. ex. seulement les matchs contre
    l'équipe suivie, serait trompeuse) — la colonne reste alors vide plutôt qu'inventée."""

    forme_recente = serializers.SerializerMethodField()

    def get_forme_recente(self, obj) -> str:
        if obj.forme_recente:
            return obj.forme_recente
        formes = self.context.get("_formes_par_equipe")
        if formes is None:
            formes = {}
            termines = RencontreCalendrier.objects.filter(
                statut=StatutRencontre.TERMINEE,
                score_domicile__isnull=False,
                score_exterieur__isnull=False,
            ).order_by("date_heure")
            for r in termines:
                for equipe, pour, contre in (
                    (r.equipe_domicile, r.score_domicile, r.score_exterieur),
                    (r.equipe_exterieur, r.score_exterieur, r.score_domicile),
                ):
                    code = "V" if pour > contre else ("N" if pour == contre else "D")
                    formes.setdefault(equipe.strip().lower(), []).append(code)
            self.context["_formes_par_equipe"] = formes
        resultats = formes.get(obj.equipe.strip().lower(), [])
        if len(resultats) < min(5, obj.joues or 5):
            return ""
        return "".join(resultats[-5:])

    class Meta:
        model = ClassementLigue
        fields = [
            "id",
            "saison",
            "equipe",
            "rang",
            "joues",
            "victoires",
            "nuls",
            "defaites",
            "buts_pour",
            "buts_contre",
            "difference",
            "points",
            "forme_recente",
            "joues_domicile",
            "victoires_domicile",
            "nuls_domicile",
            "defaites_domicile",
            "buts_pour_domicile",
            "buts_contre_domicile",
            "points_domicile",
            "joues_exterieur",
            "victoires_exterieur",
            "nuls_exterieur",
            "defaites_exterieur",
            "buts_pour_exterieur",
            "buts_contre_exterieur",
            "points_exterieur",
            "zone_texte",
            "maj_le",
        ]
        read_only_fields = fields


class RencontreCalendrierSerializer(serializers.ModelSerializer):
    """Lecture seule — toujours synchronisé depuis GOAL API, voir services.py."""

    est_a_venir = serializers.BooleanField(read_only=True)

    class Meta:
        model = RencontreCalendrier
        fields = [
            "id",
            "competition",
            "equipe_domicile",
            "equipe_exterieur",
            "date_heure",
            "score_domicile",
            "score_exterieur",
            "statut",
            "est_a_venir",
            "maj_le",
        ]
        read_only_fields = fields


class StatistiqueJoueurSerializer(serializers.ModelSerializer):
    """Lecture seule — toujours synchronisé depuis GOAL API, voir services.py."""

    class Meta:
        model = StatistiqueJoueur
        fields = [
            "id",
            "saison",
            "equipe",
            "nom",
            "numero",
            "poste",
            "matchs_joues",
            "buts",
            "passes_decisives",
            "cartons_jaunes",
            "cartons_rouges",
            "maj_le",
        ]
        read_only_fields = fields


class EquipeInfoSerializer(serializers.ModelSerializer):
    """Lecture seule — toujours synchronisé depuis GOAL API (`GET /teams/{id}`), voir
    services.py::synchroniser_equipe_info. `donnees_brutes` volontairement EXCLU des champs
    exposés — filet de sécurité interne pour une correction de mapping ultérieure (voir
    docstring de classe `EquipeInfo` dans models.py), pas une donnée destinée au frontend."""

    class Meta:
        model = EquipeInfo
        fields = [
            "nom",
            "logo_url",
            "fondee_en",
            "stade",
            "ville",
            "pays",
            "entraineur",
            "maj_le",
        ]
        read_only_fields = fields


def nom_affiche_utilisateur(user) -> str:
    """Nom affichable pour un `accounts.User` (pas nécessairement lié à un
    `membres.Membre` — un compte Bureau Admin+ créé via `createsuperuser` n'en a pas
    forcément). Partagé entre `MatchEvenementSerializer` et la diffusion WebSocket
    (voir views.py::MatchEvenementViewSet._broadcast_match_evenement), pour ne pas
    dupliquer cette règle à deux endroits."""
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}"
    return user.email


class MatchEvenementSerializer(serializers.ModelSerializer):
    """Journal d'événements du Live-Ticker (buts/cartons/etc.) — création réservée à
    Bureau Admin+ (voir MatchEvenementPermission), diffusée en direct via
    `LiveMatchConsumer` (voir views.py::MatchEvenementViewSet.perform_create).
    `created_by_nom` en SerializerMethodField plutôt qu'un AuteurSerializer imbriqué :
    `created_by` référence `accounts.User` (pas `membres.Membre`, contrairement à
    `auteur` ailleurs dans ce module)."""

    created_by_nom = serializers.SerializerMethodField()

    class Meta:
        model = MatchEvenement
        fields = [
            "id",
            "match",
            "type_evenement",
            "minute",
            "equipe",
            "joueur",
            "description",
            "created_by_nom",
            "created_at",
        ]
        read_only_fields = ["id", "created_by_nom", "created_at"]

    def get_created_by_nom(self, obj) -> str:
        return nom_affiche_utilisateur(obj.created_by)


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
    # Vignette de prévisualisation (demande utilisateur 2026-09-25) — voir
    # Album.photo_couverture ; SerializerMethodField plutôt qu'un ImageField `source=` direct
    # car la source est la photo la plus RÉCENTE de l'album, pas un champ du modèle Album
    # lui-même, voir sa docstring.
    photo_couverture = serializers.SerializerMethodField()

    uebersetzungen = UebersetzungenField()

    class Meta:
        model = Album
        fields = [
            "id",
            "uebersetzungen",
            "nom",
            "description",
            "date",
            "lieu",
            "evenement",
            "createur",
            "created_at",
            "nombre_photos",
            "photo_couverture",
        ]
        read_only_fields = ["id", "createur", "created_at", "nombre_photos", "photo_couverture"]

    def get_evenement(self, obj):
        if not obj.evenement_id:
            return None
        return {"id": str(obj.evenement_id), "titre": obj.evenement.titre}

    def get_photo_couverture(self, obj):
        photo = obj.photo_couverture
        if photo is None or not photo.image:
            return None
        request = self.context.get("request")
        url = photo.image.url
        return request.build_absolute_uri(url) if request else url

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


# ---------------------------------------------------------------------------
# Tippspiel (pronostics Ligue 1) — voir docstring de tête models.py, section Tippspiel,
# pour le contexte complet (retour utilisateur du 2026-09-24).
# ---------------------------------------------------------------------------


class TippspielPrixSerializer(serializers.ModelSerializer):
    """Un lot pour un rang du classement final — imbriqué en écriture dans
    TippspielSerializer (jamais créé/modifié via un endpoint séparé)."""

    class Meta:
        model = TippspielPrix
        fields = ["id", "platz", "type_prix", "produit", "montant", "pourcentage"]

    def validate(self, attrs):
        type_prix = attrs.get("type_prix")
        if type_prix == TypePrixTippspiel.PRODUIT and not attrs.get("produit"):
            raise serializers.ValidationError(
                {"produit": "Un article boutique est requis pour ce type de lot."}
            )
        if type_prix == TypePrixTippspiel.MONTANT_FIXE and attrs.get("montant") is None:
            raise serializers.ValidationError(
                {"montant": "Un montant est requis pour ce type de lot."}
            )
        if type_prix == TypePrixTippspiel.POURCENTAGE and attrs.get("pourcentage") is None:
            raise serializers.ValidationError(
                {"pourcentage": "Un pourcentage est requis pour ce type de lot."}
            )
        return attrs


class TippspielSerializer(serializers.ModelSerializer):
    """Écriture réservée à l'Administrateur App (voir TippspielPermission) — les lots
    (`prix`) sont définis à la création/modification en une seule requête imbriquée
    ("Beim Erstellen des Spiels kann es möglich sein ... zu definieren", retour
    utilisateur), jamais via un endpoint séparé : `create`/`update` remplacent
    intégralement la liste des lots à chaque écriture (pas de PATCH partiel sur un lot
    individuel — un Tippspiel encore en `brouillon` peut être réédité librement)."""

    prix = TippspielPrixSerializer(many=True, required=False)
    created_by_nom = serializers.SerializerMethodField()

    class Meta:
        model = Tippspiel
        fields = [
            "id",
            "titre",
            "saison",
            "regles",
            "statut",
            "montant_participation",
            "prix",
            "created_by_nom",
            "created_at",
            "maj_le",
        ]
        read_only_fields = ["id", "created_by_nom", "created_at", "maj_le"]

    def get_created_by_nom(self, obj):
        return getattr(obj.created_by, "email", "")

    def create(self, validated_data):
        # `created_by` arrive déjà dans validated_data (injecté par
        # TippspielViewSet.perform_create via `serializer.save(created_by=...)`, même
        # convention que QuizViewSet.perform_create) — jamais réinjecté ici, sous peine
        # de "got multiple values for keyword argument 'created_by'".
        prix_data = validated_data.pop("prix", [])
        tippspiel = Tippspiel.objects.create(**validated_data)
        for prix in prix_data:
            TippspielPrix.objects.create(tippspiel=tippspiel, **prix)
        return tippspiel

    def update(self, instance, validated_data):
        prix_data = validated_data.pop("prix", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Remplacement intégral plutôt qu'un diff fin (create/update/delete par id) —
        # un Tippspiel `publie`/`cloture` n'a de toute façon plus vocation à voir ses
        # lots réédités en pratique ; suffisant pour le cas d'usage réel (ajuster les
        # lots d'un brouillon avant publication).
        if prix_data is not None:
            instance.prix.all().delete()
            for prix in prix_data:
                TippspielPrix.objects.create(tippspiel=instance, **prix)
        return instance


class TippspielTeilnahmeSerializer(serializers.ModelSerializer):
    """Représente une ligne du classement (participation confirmée, voir action
    `classement`) OU l'état de sa propre inscription (action `teilnehmen`/`?mine=true`,
    voir TippspielTeilnahmeViewSet). `total_points` est annoté côté vue (somme des
    points déjà notés de tous les pronostics de cette participation) — jamais recalculé
    ici. Ne contient JAMAIS le détail des pronostics d'autrui (voir
    TippspielTipPermission). `tippspiel_titre`/`montant_participation` ajoutés le
    2026-09-24 pour l'écran "Ausstehende Zahlungen" (`?statut_paiement=en_attente`
    liste désormais tous les Tippspiele confondus, voir TippspielTeilnahmeViewSet) —
    sans ces deux champs, cette liste transversale ne permettrait pas de savoir à quel
    jeu ni quel montant chaque paiement en attente se rapporte."""

    membre_nom = serializers.SerializerMethodField()
    tippspiel_titre = serializers.SerializerMethodField()
    montant_participation = serializers.SerializerMethodField()
    total_points = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = TippspielTeilnahme
        fields = [
            "id",
            "tippspiel",
            "tippspiel_titre",
            "membre_nom",
            "statut_paiement",
            "montant_participation",
            "confirmee_le",
            "created_at",
            "total_points",
        ]
        read_only_fields = fields

    def get_membre_nom(self, obj):
        return f"{obj.membre.prenom} {obj.membre.nom}".strip()

    def get_tippspiel_titre(self, obj):
        return str(obj.tippspiel)

    def get_montant_participation(self, obj):
        montant = obj.tippspiel.montant_participation
        return str(montant) if montant is not None else None


class TippspielTipSerializer(serializers.ModelSerializer):
    """Un membre gère STRICTEMENT ses propres pronostics (voir TippspielTipPermission).
    `tippspiel` est write-only (sert uniquement à `create` pour retrouver/créer la
    `TippspielTeilnahme` du membre courant, voir `TippspielTeilnahmeManager.rejoindre`)
    — jamais de `teilnahme` brute acceptée en entrée (IDOR, CLAUDE.md §8). Validation de
    périmètre et de date-limite dans `validate` : rencontre Ligue 1 de Club Africain,
    pas déjà jouée/reportée/annulée, au moins 1 jour avant le coup d'envoi ("Frist der
    Angabe der Tipps 1 Tag vor dem Spiel", retour utilisateur).

    `create` refuse tout nouveau pronostic tant que la participation n'est pas
    `est_confirmee` (2026-09-24, retour utilisateur : "Für Beitragspflichtige Spiele,
    müssen Tipps verfügbar sein, nachdem die Bezahlung bestätigt wird") — CONTREDIT la
    décision précédente documentée dans TippspielTeilnahme.models.py ("pronostiquer
    reste possible même paiement non confirmé, pour ne pas rater la date-limite pendant
    un virement en cours") : l'usage réel a montré que des membres pronostiquaient sans
    jamais régulariser leur paiement, d'où ce revirement explicite côté utilisateur.
    Un Tippspiel gratuit (`SANS_FRAIS`, confirmé d'emblée par `rejoindre`) n'est donc
    jamais bloqué ici."""

    tippspiel = serializers.PrimaryKeyRelatedField(
        queryset=Tippspiel.objects.all(), write_only=True
    )
    rencontre_infos = RencontreCalendrierSerializer(source="rencontre", read_only=True)

    class Meta:
        model = TippspielTip
        fields = [
            "id",
            "tippspiel",
            "rencontre",
            "rencontre_infos",
            "score_domicile",
            "score_exterieur",
            "points",
            "created_at",
            "maj_le",
        ]
        read_only_fields = ["id", "points", "created_at", "maj_le"]

    def validate(self, attrs):
        rencontre = attrs.get("rencontre") or getattr(self.instance, "rencontre", None)
        if rencontre is None:
            return attrs
        if rencontre.competition != "Ligue 1":
            raise serializers.ValidationError(
                {"rencontre": "Les pronostics ne sont ouverts que pour les rencontres de Ligue 1."}
            )
        if rencontre.statut != StatutRencontre.PROGRAMMEE:
            raise serializers.ValidationError(
                {"rencontre": "Cette rencontre n'est plus ouverte aux pronostics."}
            )
        limite = rencontre.date_heure - timedelta(days=1)
        if django_timezone.now() >= limite:
            raise serializers.ValidationError(
                {
                    "rencontre": (
                        "La date limite pour pronostiquer cette rencontre est dépassée "
                        "(1 jour avant le coup d'envoi)."
                    )
                }
            )
        return attrs

    def create(self, validated_data):
        tippspiel = validated_data.pop("tippspiel")
        request = self.context["request"]
        membre = getattr(request.user, "membre", None)
        teilnahme, _cree = TippspielTeilnahme.objects.rejoindre(tippspiel, membre)
        if not teilnahme.est_confirmee:
            raise serializers.ValidationError(
                "Les pronostics ne sont disponibles qu'une fois le paiement de la "
                "participation confirmé par le Directeur Financier."
            )
        return TippspielTip.objects.create(teilnahme=teilnahme, **validated_data)


class ConfigurationSitePublicSerializer(serializers.ModelSerializer):
    """Singleton (voir ConfigurationSitePublic.get_solo) — `modifie_par` est résolu par la vue
    (l'utilisateur courant), jamais par le client, même principe que
    ParametresNotificationSerializer/ConfigurationRelanceSerializer."""

    class Meta:
        model = ConfigurationSitePublic
        fields = [
            "video_hero",
            "kachel1_active",
            "kachel1_media",
            "kachel1_titre",
            "kachel1_texte",
            "kachel1_lien",
            "kachel1_largeur",
            "kachel2_active",
            "kachel2_media",
            "kachel2_titre",
            "kachel2_texte",
            "kachel2_lien",
            "kachel2_largeur",
            "modifie_par",
            "updated_at",
        ]
        read_only_fields = ["modifie_par", "updated_at"]

    def validate_video_hero(self, video):
        return valider_video_hero(video)

    def validate_kachel1_media(self, media):
        return valider_media_kachel(media)

    def validate_kachel2_media(self, media):
        return valider_media_kachel(media)

    def _valider_lien(self, lien: str) -> str:
        # Lien interne ("/boutique") ou https:// uniquement — jamais javascript:/data: (XSS).
        lien = (lien or "").strip()
        if lien and not (lien.startswith("/") or lien.startswith("https://")):
            raise serializers.ValidationError("Lien interne (/...) ou https:// uniquement.")
        return lien

    def validate_kachel1_lien(self, lien):
        return self._valider_lien(lien)

    def validate_kachel2_lien(self, lien):
        return self._valider_lien(lien)


class EquipeLogoSerializer(serializers.ModelSerializer):
    """`equipe` est le seul champ modifiable par le client en plus du fichier — `modifie_par`
    est résolu par la vue (utilisateur courant), jamais par le client, même principe que
    ConfigurationSitePublicSerializer ci-dessus. Voir EquipeLogoViewSet.create pour l'upsert
    par nom d'équipe (un upload pour un nom déjà présent remplace le logo existant) : le
    validateur d'unicité automatique de DRF sur `equipe` (dérivé de `unique=True` côté
    modèle) est désactivé ci-dessous (`extra_kwargs`), sans quoi un second upload pour un
    nom déjà présent échouerait en 400 AVANT d'atteindre la logique d'upsert de la vue."""

    class Meta:
        model = EquipeLogo
        fields = ["id", "equipe", "logo", "modifie_par", "updated_at"]
        read_only_fields = ["id", "modifie_par", "updated_at"]
        extra_kwargs = {"equipe": {"validators": []}}

    def validate_logo(self, image):
        return valider_et_reencoder_photo(image)


class ArrierePlanModuleSerializer(serializers.ModelSerializer):
    """`module` est le seul champ modifiable par le client en plus du fichier — `modifie_par`
    est résolu par la vue (utilisateur courant), même principe qu'EquipeLogoSerializer
    ci-dessus. Voir ArrierePlanModuleViewSet.create pour l'upsert par slug de module (un
    upload pour un module déjà présent remplace l'image existante) : le validateur
    d'unicité automatique de DRF sur `module` (dérivé de `unique=True` côté modèle) est
    désactivé ci-dessous (`extra_kwargs`), même raison qu'EquipeLogoSerializer.

    Ajouté le 2026-09-29 (demande utilisateur : "Im Modul 'Hero Video' es soll möglich sein
    Hintergrund Bilder pro Modul (außer in der Kategorie Verwaltung) hochzuladen")."""

    class Meta:
        model = ArrierePlanModule
        fields = ["id", "module", "image", "modifie_par", "updated_at"]
        read_only_fields = ["id", "modifie_par", "updated_at"]
        extra_kwargs = {"module": {"validators": []}}

    def validate_module(self, value):
        if value not in MODULES_AVEC_ARRIERE_PLAN:
            raise serializers.ValidationError("Ce module n'accepte pas d'image de fond.")
        return value

    def validate_image(self, image):
        return valider_et_reencoder_photo(image)

"""
Modèles — app communaute (Phase 4A, R2).

Premier lot du module Communauté (Release Plan §3.2) : **Fil d'actualité** et **Forum**,
purement REST/CRUD — sans WebSocket ni chiffrement.

Deuxième lot (même fichier, ajouté ensuite) : **Messagerie privée** et **Groupes de
chat** — tous deux réutilisent l'infrastructure Django Channels installée dès la Phase 3
(apps.vote, voir CID-RPL-001 §4.2 "L'infrastructure WebSocket est déjà opérationnelle et
testée au moment d'attaquer R2") : mêmes briques (JWTAuthMiddlewareStack, Redis channel
layer), même découpage WS/REST que apps.vote.VoteConsumer — la mutation en temps réel
(envoyer un message) passe UNIQUEMENT par le WebSocket (`receive_json`), jamais par un
endpoint REST équivalent, pour ne pas dupliquer la logique métier sur deux chemins ; REST
ne sert qu'à l'historique (liste des conversations/groupes, pagination des messages) —
voir consumers.py/views.py. Live Match (aussi WebSocket, Phase 4B) reste pour une phase
ultérieure (voir CLAUDE.md §7).

Niveau de sécurité "Moyenne" (CID-SCD-001 §résumé "Forum / Fil") : RBAC seulement (pas de
chiffrement — contenu non sensible), 100 req/min (DEFAULT_THROTTLE_RATES["user"], pas de
throttle_scope dédié), journalisation des actions de MODÉRATION uniquement (pas d'audit
des lectures/publications normales — voir apps.accounts.services.log_audit_event, appelé
depuis views.py sur les actions masquer/épingler/verrouiller).

Fil d'actualité (FDD/Release Plan §3.2 "Publications texte/photos, hashtags, likes,
commentaires, partage. Modération admin. Fil personnalisé.") :
  - Publication : texte + photo optionnelle (bucket "cid-media", voir storage.py),
    hashtags extraits automatiquement du texte (#mot-clé) et normalisés en minuscules dans
    Hashtag pour un filtre `?hashtag=` insensible à la casse.
  - "Fil personnalisé" : au sens le plus simple compatible avec le périmètre documenté
    (aucune notion de "suivre un membre" n'existe ailleurs dans le FDD/SDD) — un fil
    anti-chronologique des publications non masquées, propre à chaque membre authentifié
    (comme tout endpoint DRF), plutôt qu'un moteur de recommandation. Documenté ici pour
    ne pas laisser le terme du Release Plan sans traduction technique explicite.
  - Modération admin : `est_masquee` (soft-hide, préserve l'historique/l'audit) plutôt
    qu'une suppression définitive — un membre reste libre de supprimer sa PROPRE
    publication (DELETE réel, voir permissions.py), mais un modérateur (Bureau Admin+)
    ne fait que la masquer, avec motif, pour rester auditable (CID-SCD-001 §8.1).
  - "Partage" (Release Plan) : le mockup ne fait qu'un toast ("Publication partagée") sans
    dupliquer le contenu dans le fil (pas de mécanique de "repost" documentée ailleurs) —
    modélisé ici comme une action à bascule (comme Like), utile pour un futur classement
    d'engagement (Release Plan §3.2 "Classement & Gamification", Phase 4B) sans complexité
    de duplication de contenu hors périmètre documenté.

Forum (FDD/Release Plan §3.2 "4 catégories (Football CA, Vie en DE, Emploi, Général),
threads, réponses, épinglage, modération admin") :
  - 4 catégories : `CategorieForum` (TextChoices), même convention que
    `apps.boutique.models.CategorieProduit`/`StatutCommande` pour un ensemble fixe de
    valeurs traduites côté frontend (i18n), plutôt qu'une table dédiée — ces 4 catégories
    sont un choix produit figé au Release Plan, pas un référentiel géré par les admins.
    Note de cohérence : le mockup HTML (clubistes_deutschland_mockup_v2.html) affiche un
    5ᵉ intitulé ("Culture & Loisirs") dans son <select> de démonstration — non repris ici,
    le Release Plan (document de référence pour le périmètre fonctionnel, CLAUDE.md en-tête)
    étant explicite sur "4 catégories" et les nommant précisément.
  - Sujet : peut être épinglé (`est_epingle`, remonte en tête de liste) et verrouillé
    (`est_verrouille`, bloque les nouvelles réponses) par un modérateur — actions
    distinctes du masquage (`est_masque`, soft-hide comme Publication).
  - Reponse : pas d'épinglage/verrouillage (ça n'a de sens qu'au niveau du sujet), mais
    la même modération de masquage (`est_masquee`) qu'un commentaire de fil.

Troisième lot (Phase 4B, Release Plan §3.2, CLAUDE.md §7) : **Live Match**, **Albums
photos**, **Quiz** — voir CLAUDE.md pour le découpage exact du périmètre (Sondages,
Classement & Gamification, Petites annonces, Experts & Talents restent hors Phase 4B,
malgré leur regroupement dans le même "S15" du Release Plan/Timeline — CLAUDE.md §7 les
isole explicitement comme suite ultérieure).

Live Match (Release Plan §3.2 "Score en direct, chrono, commentaires live WebSocket,
réactions emoji temps réel, membres connectés") :
  - `Match` : score/chrono/statut gérés exclusivement par un modérateur (Bureau Admin+) via
    REST ; la diffusion aux membres connectés passe par `LiveMatchConsumer` (broadcast
    déclenché depuis `MatchViewSet.perform_update`, même mécanisme que
    `apps.vote.views.VoteSessionViewSet._broadcast_resultats` — voir consumers.py).
  - `MatchCommentaire` : chat live, même profil que `MessageGroupe` (contenu en clair,
    envoi exclusivement WebSocket, voir consumers.py).
  - `MatchReaction` : réaction emoji temps réel — délibérément SANS contrainte d'unicité
    (le mockup incrémente un compteur à chaque clic, comme un live Instagram/Twitter,
    plutôt qu'un like à bascule) : chaque ligne est une frappe individuelle, agrégée côté
    API/WS pour l'affichage des compteurs par emoji.
  - Les jauges "Confiance dans le CA"/"Ambiance fanzone" du mockup ne correspondent à
    aucune fonctionnalité listée dans le Release Plan ("réactions emoji temps réel" est le
    seul mécanisme de sondage d'opinion documenté pour Live Match) — délibérément hors
    périmètre, même raisonnement que la 5ᵉ catégorie de forum plus haut.

Albums photos (Release Plan §3.2 "Albums par événement, upload collaboratif, légende,
likes, commentaires. Photos produits boutique utilisent déjà MinIO.") :
  - `Album` : le Release Plan/mockup d'origine prévoyaient une création ouverte à tout
    membre authentifié ("upload collaboratif" au sens le plus large). Revenu sur ce choix le
    2026-09-22 sur demande utilisateur ("Die Verwaltung der Albums soll im Bereich Admin
    stattfinden") : créer/modifier/supprimer un album, ou y uploader des photos, est
    désormais réservé à Bureau Admin+ (voir AlbumPermission/PhotoPermission) — le module
    membre reste consultation seule (+ likes/commentaires/suppression de sa propre photo,
    conservés : ce n'est pas de la "gestion" d'album). Champs `date`/`lieu` ajoutés à cette
    occasion (saisie libre, optionnels), distincts du rattachement optionnel à un
    `apps.evenements.Evenement` existant (`evenement`, toujours géré via l'admin Django).
  - `Photo` : image toujours validée puis RE-ENCODÉE par `validators
    .valider_et_reencoder_photo` avant stockage (CID-SCD-001 §7.4 "Pillow redimensionne et
    re-encode les images avant stockage" — jamais les octets bruts envoyés par le client),
    stockage bucket "cid-media" (réutilise l'infra Fil d'actualité, voir storage.py).
    Modération : `est_masquee` (soft-hide), même pattern que Publication/Sujet.
  - `PhotoLike`/`PhotoCommentaire` : mêmes patterns que `PublicationLike`/`Commentaire`, à
    plat (pas de réponse imbriquée — non documenté pour ce sous-module).

Quiz (Release Plan §3.2 "Quiz histoire du CA avec score et classement.") :
  - `Quiz`/`QuestionQuiz`/`ChoixQuestion` : gestion (créer/publier les questions) réservée
    à Bureau Admin+ (mockup : aucune UI de création de quiz côté membre). `est_correct` sur
    `ChoixQuestion` n'est JAMAIS exposé au frontend avant réponse (voir
    serializers.QuestionQuizSerializer), pour ne pas permettre de deviner la bonne réponse
    en inspectant la requête réseau.
  - `ParticipationQuiz` : au plus une par (quiz, membre) — un quiz "mensuel" ne se refait
    pas (mockup : la ligne de classement affiche "Vous (en cours)" puis un score final
    unique, pas de mécanique de reprise). `score`/`ReponseQuiz.est_correct`/
    `ReponseQuiz.points_obtenus` sont TOUJOURS recalculés côté serveur (CLAUDE.md §8, même
    principe que le prix final en Boutique/Adhésions), jamais transmis par le client.
  - Classement (mockup "Classement quiz") : score décroissant, temps de complétion
    croissant pour départager (`ParticipationQuiz.Meta.ordering`) — aucun barème précis
    n'est documenté dans le FDD/Release Plan au-delà de "score et classement" ; ce
    départage par rapidité reproduit fidèlement l'ordre observé dans le mockup (5/5 en 42s
    classé devant 4/5, lui-même devant un autre 4/5 plus lent) sans inventer de formule de
    bonus de vitesse non spécifiée.
"""

import re
import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from encrypted_model_fields.fields import EncryptedTextField

from .storage import AlbumsStorage, PublicationsStorage

# Un mot-clé hashtag : lettres/chiffres/underscore Unicode après un "#", ex. "#CA1920" ou
# "#Vie_en_Allemagne" — volontairement permissif (pas de longueur minimale) plutôt que de
# risquer de rater des hashtags réels non documentés précisément dans le FDD.
HASHTAG_RE = re.compile(r"#(\w+)", re.UNICODE)


def extraire_hashtags(contenu: str) -> list[str]:
    """Normalise en minuscules et dédoublonne en conservant l'ordre d'apparition."""
    vus: dict[str, None] = {}
    for match in HASHTAG_RE.findall(contenu or ""):
        vus.setdefault(match.lower(), None)
    return list(vus.keys())


class Hashtag(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    label = models.CharField(max_length=100, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_hashtags"
        verbose_name = _("Hashtag")
        verbose_name_plural = _("Hashtags")
        ordering = ["label"]

    def __str__(self):
        return f"#{self.label}"


def publication_image_upload_path(instance, filename):
    return f"fil/{instance.id}/{filename}"


def publication_document_upload_path(instance, filename):
    return f"fil/{instance.id}/documents/{filename}"


class Publication(models.Model):
    """Publication du fil d'actualité — Release Plan §3.2."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="publications"
    )
    contenu = models.TextField()
    image = models.ImageField(
        upload_to=publication_image_upload_path,
        storage=PublicationsStorage(),
        null=True,
        blank=True,
    )
    # Ajouté le 2026-09-20 (retour utilisateur : "Hochladen von pdf Dokumenten") — pièce
    # jointe PDF, distincte de `image` (un `FileField` plutôt qu'un `ImageField` : un PDF
    # n'est pas une image et ne peut pas être ouvert/validé par Pillow, voir
    # validators.valider_document_pdf). Une publication ne porte jamais les deux à la fois
    # en pratique (un seul sélecteur de fichier côté frontend, voir FilPage.tsx), mais rien
    # ici ne l'empêche techniquement — pas de contrainte d'exclusion mutuelle ajoutée pour
    # rester simple, aucun cas d'usage ne le justifie.
    document = models.FileField(
        upload_to=publication_document_upload_path,
        storage=PublicationsStorage(),
        null=True,
        blank=True,
    )
    hashtags = models.ManyToManyField(Hashtag, related_name="publications", blank=True)

    est_masquee = models.BooleanField(
        default=False, help_text=_("Modération admin — soft-hide, préserve l'historique.")
    )
    masquee_par = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="publications_masquees",
    )
    motif_masquage = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_publications"
        verbose_name = _("Publication")
        verbose_name_plural = _("Publications")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["est_masquee", "-created_at"])]

    def __str__(self):
        apercu = (self.contenu or "")[:40]
        return f"{self.auteur} — {apercu}"

    def synchroniser_hashtags(self):
        """Recrée les liens M2M à partir du texte actuel — appelé explicitement par le
        serializer après save() (les hashtags dépendent du texte final, et un M2M ne peut
        être défini qu'une fois l'instance déjà persistée)."""
        labels = extraire_hashtags(self.contenu)
        hashtags = [Hashtag.objects.get_or_create(label=label)[0] for label in labels]
        self.hashtags.set(hashtags)


class PublicationLike(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="likes")
    membre = models.ForeignKey("membres.Membre", on_delete=models.CASCADE, related_name="likes_fil")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_publication_likes"
        constraints = [
            models.UniqueConstraint(
                fields=["publication", "membre"], name="un_seul_like_par_membre"
            )
        ]

    def __str__(self):
        return f"{self.membre} ♥ {self.publication_id}"


class PublicationPartage(models.Model):
    """Action de partage à bascule — voir docstring module ("Partage")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    publication = models.ForeignKey(Publication, on_delete=models.CASCADE, related_name="partages")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="partages_fil"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_publication_partages"
        constraints = [
            models.UniqueConstraint(
                fields=["publication", "membre"], name="un_seul_partage_par_membre"
            )
        ]

    def __str__(self):
        return f"{self.membre} ↻ {self.publication_id}"


class Commentaire(models.Model):
    """Commentaire (et réponse à un commentaire, un seul niveau — `parent`) — mockup
    addCmt/addReply."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    publication = models.ForeignKey(
        Publication, on_delete=models.CASCADE, related_name="commentaires"
    )
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="reponses"
    )
    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="commentaires_fil"
    )
    contenu = models.TextField()

    est_masque = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_commentaires"
        verbose_name = _("Commentaire")
        verbose_name_plural = _("Commentaires")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["publication", "created_at"])]

    def __str__(self):
        return f"{self.auteur} — {(self.contenu or '')[:30]}"


class CategorieForum(models.TextChoices):
    """4 catégories fixes — Release Plan §3.2, voir docstring module pour la note de
    cohérence avec le mockup."""

    FOOTBALL_CA = "football_ca", _("Football CA")
    VIE_EN_ALLEMAGNE = "vie_en_allemagne", _("Vie en Allemagne")
    EMPLOI = "emploi", _("Emploi & Business")
    GENERAL = "general", _("Général")


class Sujet(models.Model):
    """Fil de discussion du forum — Release Plan §3.2."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="sujets_forum"
    )
    categorie = models.CharField(max_length=20, choices=CategorieForum.choices)
    titre = models.CharField(max_length=200)
    contenu = models.TextField()

    est_epingle = models.BooleanField(default=False, help_text=_("Remonte en tête de liste."))
    est_verrouille = models.BooleanField(
        default=False, help_text=_("Bloque les nouvelles réponses sans masquer le sujet.")
    )
    est_masque = models.BooleanField(default=False, help_text=_("Modération admin — soft-hide."))
    masque_par = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sujets_masques",
    )
    motif_masquage = models.CharField(max_length=255, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_forum_sujets"
        verbose_name = _("Sujet de forum")
        verbose_name_plural = _("Sujets de forum")
        # Épinglés en tête, puis les plus récents — cf. mockup (sujets épinglés visibles en
        # premier dans la liste des threads).
        ordering = ["-est_epingle", "-created_at"]
        indexes = [models.Index(fields=["categorie", "est_masque"])]

    def __str__(self):
        return self.titre

    @property
    def nombre_reponses(self) -> int:
        return self.reponses.filter(est_masquee=False).count()


class ReponseForum(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    sujet = models.ForeignKey(Sujet, on_delete=models.CASCADE, related_name="reponses")
    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="reponses_forum"
    )
    contenu = models.TextField()

    est_masquee = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_forum_reponses"
        verbose_name = _("Réponse de forum")
        verbose_name_plural = _("Réponses de forum")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["sujet", "created_at"])]

    def __str__(self):
        return f"{self.auteur} — {(self.contenu or '')[:30]}"


# ---------------------------------------------------------------------------
# Messagerie privée + Groupes de chat (deuxième lot — voir docstring de tête)
# ---------------------------------------------------------------------------


class Conversation(models.Model):
    """Conversation 1-to-1 entre deux membres (Messagerie privée, Release Plan §3.2).

    La paire (membre_a, membre_b) est canonicalisée à la création (ordre déterministe par
    UUID croissant, indépendant de qui a lancé la conversation) afin qu'une contrainte
    d'unicité simple empêche deux conversations distinctes pour la même paire — voir
    `get_or_create_entre()`, seul point d'entrée prévu pour la création.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    membre_a = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="conversations_a"
    )
    membre_b = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="conversations_b"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_conversations"
        verbose_name = _("Conversation")
        verbose_name_plural = _("Conversations")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["membre_a", "membre_b"], name="conversation_paire_unique"
            )
        ]

    def __str__(self):
        return f"{self.membre_a} <-> {self.membre_b}"

    @classmethod
    def get_or_create_entre(cls, membre_1, membre_2):
        """Retourne (en la créant si besoin) la conversation entre deux membres.

        Canonicalise l'ordre de la paire par UUID croissant pour garantir l'unicité
        indépendamment du membre qui initie la conversation.
        """
        if str(membre_1.id) <= str(membre_2.id):
            membre_a, membre_b = membre_1, membre_2
        else:
            membre_a, membre_b = membre_2, membre_1
        conversation, _created = cls.objects.get_or_create(membre_a=membre_a, membre_b=membre_b)
        return conversation

    def participant(self, membre) -> bool:
        return membre.id in (self.membre_a_id, self.membre_b_id)

    def autre_participant(self, membre):
        return self.membre_b if membre.id == self.membre_a_id else self.membre_a


class MessagePrive(models.Model):
    """Message d'une conversation privée — contenu chiffré AES-256 (CID-SCD-001 §résumé
    "Messagerie privée" : "Conversations 1-to-1 chiffrées AES-256, indicateur 'lu',
    notification email si hors ligne"), via `EncryptedTextField` (même mécanisme que
    `Membre.cin`/`Membre.passeport`, clé `FIELD_ENCRYPTION_KEY`/`SECRET_FIELD_KEY`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    expediteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="messages_prives_envoyes"
    )
    contenu = EncryptedTextField()

    est_lu = models.BooleanField(default=False)
    lu_le = models.DateTimeField(null=True, blank=True)

    # "Antworten" (demande utilisateur 2026-09-25, "auf einzelnen Nachrichten zu reagieren
    # (Like oder antworten)") — référence légère vers le message cité, pas un fil de
    # discussion imbriqué (contrairement à Commentaire.parent) : une citation à un seul
    # niveau au-dessus du message, affichée comme aperçu dans la bulle (voir
    # MessagePriveApercuSerializer). SET_NULL : la suppression d'un message cité (DELETE,
    # déjà permis à l'expéditeur) ne doit jamais entraîner celle des réponses qui le citent.
    repond_a = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reponses"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_messages_prives"
        verbose_name = _("Message privé")
        verbose_name_plural = _("Messages privés")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self):
        return f"{self.expediteur} @ {self.conversation_id}"


class MessagePriveLike(models.Model):
    """ "Like" sur un message privé (demande utilisateur 2026-09-25) — même patron que
    `PublicationLike` (bascule create/delete, un seul like par membre et par message)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(MessagePrive, on_delete=models.CASCADE, related_name="likes")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="likes_messages_prives"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_message_prive_likes"
        constraints = [
            models.UniqueConstraint(
                fields=["message", "membre"], name="un_seul_like_message_prive_par_membre"
            )
        ]

    def __str__(self):
        return f"{self.membre} ♥ {self.message_id}"


class TypeGroupe(models.TextChoices):
    PUBLIC = "public", _("Public")
    PRIVE = "prive", _("Privé")


class GroupeChat(models.Model):
    """Groupe de chat temps réel (Release Plan §3.2 "Groupes public ou privé, chat temps
    réel WebSocket, créer/rejoindre"). Pas de chiffrement — contenu non individualisé,
    même niveau de sécurité que Forum/Fil (RBAC standard, voir CID-SCD-001)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    nom = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    type_groupe = models.CharField(
        max_length=10, choices=TypeGroupe.choices, default=TypeGroupe.PUBLIC
    )

    createur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="groupes_crees"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_groupes_chat"
        verbose_name = _("Groupe de chat")
        verbose_name_plural = _("Groupes de chat")
        ordering = ["-created_at"]

    def __str__(self):
        return self.nom


class MembreGroupe(models.Model):
    """Appartenance d'un membre à un groupe de chat (table de liaison avec date d'entrée)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    groupe = models.ForeignKey(GroupeChat, on_delete=models.CASCADE, related_name="membres_groupe")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="groupes_rejoints"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_membres_groupe"
        verbose_name = _("Membre de groupe")
        verbose_name_plural = _("Membres de groupe")
        constraints = [
            models.UniqueConstraint(fields=["groupe", "membre"], name="membre_groupe_unique")
        ]

    def __str__(self):
        return f"{self.membre} @ {self.groupe}"


class MessageGroupe(models.Model):
    """Message d'un groupe de chat — contenu en clair (voir docstring de `GroupeChat`)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    groupe = models.ForeignKey(GroupeChat, on_delete=models.CASCADE, related_name="messages")
    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="messages_groupe"
    )
    contenu = models.TextField()

    # "Antworten" — même principe que MessagePrive.repond_a ci-dessus (citation à un seul
    # niveau, jamais de fil imbriqué).
    repond_a = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reponses"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_messages_groupe"
        verbose_name = _("Message de groupe")
        verbose_name_plural = _("Messages de groupe")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["groupe", "created_at"])]

    def __str__(self):
        return f"{self.auteur} @ {self.groupe_id}"


class MessageGroupeLike(models.Model):
    """ "Like" sur un message de groupe (demande utilisateur 2026-09-25) — même patron que
    `MessagePriveLike` ci-dessus / `PublicationLike`."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    message = models.ForeignKey(MessageGroupe, on_delete=models.CASCADE, related_name="likes")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="likes_messages_groupe"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_message_groupe_likes"
        constraints = [
            models.UniqueConstraint(
                fields=["message", "membre"], name="un_seul_like_message_groupe_par_membre"
            )
        ]

    def __str__(self):
        return f"{self.membre} ♥ {self.message_id}"


# ---------------------------------------------------------------------------
# Live Match (troisième lot, Phase 4B — voir docstring de tête)
# ---------------------------------------------------------------------------


class StatutMatch(models.TextChoices):
    A_VENIR = "a_venir", _("À venir")
    EN_COURS = "en_cours", _("En cours")
    TERMINE = "termine", _("Terminé")


class Match(models.Model):
    """Live Match — voir docstring de tête pour le découpage des responsabilités REST/WS."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    adversaire = models.CharField(max_length=200)
    competition = models.CharField(max_length=200, blank=True)
    lieu = models.CharField(max_length=200, blank=True)
    date_heure = models.DateTimeField()

    statut = models.CharField(
        max_length=10, choices=StatutMatch.choices, default=StatutMatch.A_VENIR
    )
    score_ca = models.PositiveSmallIntegerField(default=0)
    score_adversaire = models.PositiveSmallIntegerField(default=0)
    minute_chrono = models.PositiveSmallIntegerField(
        default=0, help_text=_("Minute affichée pendant que statut=en_cours.")
    )

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="matchs_crees"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_matchs"
        verbose_name = _("Match")
        verbose_name_plural = _("Matchs")
        ordering = ["-date_heure"]

    def __str__(self):
        return f"CA vs {self.adversaire} — {self.date_heure:%Y-%m-%d}"


class MatchCommentaire(models.Model):
    """Commentaire live (chat) — envoi exclusivement WebSocket, voir consumers.py."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="commentaires")
    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="commentaires_live"
    )
    contenu = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_match_commentaires"
        verbose_name = _("Commentaire live")
        verbose_name_plural = _("Commentaires live")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["match", "created_at"])]

    def __str__(self):
        return f"{self.auteur} @ {self.match_id}"


class TypeReactionMatch(models.TextChoices):
    COEUR = "coeur", "❤️"
    FEU = "feu", "🔥"
    ETOILE = "etoile", "⭐"
    SURPRISE = "surprise", "😅"


class MatchReaction(models.Model):
    """Réaction emoji temps réel — voir docstring de tête ("chaque ligne est une frappe
    individuelle", pas de bascule/contrainte d'unicité)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="reactions")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="reactions_live"
    )
    emoji = models.CharField(max_length=10, choices=TypeReactionMatch.choices)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_match_reactions"
        verbose_name = _("Réaction live")
        verbose_name_plural = _("Réactions live")
        indexes = [models.Index(fields=["match", "emoji"])]

    def __str__(self):
        return f"{self.membre} {self.emoji} @ {self.match_id}"


# ---------------------------------------------------------------------------
# Fan-Club — extension du Live Match (2026-09-24, demande utilisateur : renommer
# "Live-Spiel" en "Fan-Club" et ajouter classement/calendrier/statistiques réels de Club
# Africain). Décision retenue (hybride, voir plan approuvé) : `ClassementLigue` et
# `RencontreCalendrier` sont synchronisés automatiquement depuis SerpApi/Google Sports (voir
# services.py — remplace API-Football le 2026-09-24, lui-même remplaçant TheSportsDB
# quelques heures plus tôt le même jour : TheSportsDB s'est révélé inutilisable pour la
# Ligue 1 tunisienne/Club Africain, puis le plan gratuit d'API-Football s'est révélé
# bloquer l'accès aux saisons récentes/en cours — recherche tenue avec l'utilisateur, voir
# historique) — aucune API gratuite ne fournissant de données live pour la Ligue 1
# tunisienne. Le Live-Ticker (score/chrono déjà géré par `Match` ci-dessus) reste
# piloté par un modérateur (Bureau Admin+), et `MatchEvenement` ajoute un journal
# d'événements (buts/cartons) diffusé en direct via `LiveMatchConsumer` — voir
# consumers.py, `MatchEvenementPermission` reprend délibérément le même seuil plat
# (`MODERATION_MIN_LEVEL`) que `MatchPermission`, sans passer par la matrice RBAC par
# page (apps.rbac), pour rester cohérent avec l'exclusion déjà documentée de Live Match.
# ---------------------------------------------------------------------------


class ClassementLigue(models.Model):
    """Une ligne de tableau de classement (une équipe, une saison) — synchronisée
    périodiquement depuis GOAL API (goal-api.com), jamais éditée manuellement (voir
    services.py::synchroniser_classement).

    Champs `*_domicile`/`*_exterieur` ajoutés lors de la bascule SerpApi → GOAL API
    (2026-09-24, décision utilisateur "Komplett auf GOAL API umstellen") : GOAL API
    renvoie nativement trois séries par équipe (ensemble/domicile/extérieur), ce que
    SerpApi/Google Sports ne fournissait pas — voir docstring de tête services.py.
    `forme_recente` reste alimenté seulement si GOAL API l'expose sur l'endpoint
    standings (non confirmé au moment de l'implémentation) ; laissé vide sinon plutôt
    que d'inventer une valeur."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    saison = models.CharField(max_length=20, help_text=_('Ex. "2025-2026".'))
    equipe = models.CharField(max_length=200)
    rang = models.PositiveSmallIntegerField()
    joues = models.PositiveSmallIntegerField(default=0)
    victoires = models.PositiveSmallIntegerField(default=0)
    nuls = models.PositiveSmallIntegerField(default=0)
    defaites = models.PositiveSmallIntegerField(default=0)
    buts_pour = models.PositiveSmallIntegerField(default=0)
    buts_contre = models.PositiveSmallIntegerField(default=0)
    difference = models.SmallIntegerField(default=0)
    points = models.PositiveSmallIntegerField(default=0)
    forme_recente = models.CharField(
        max_length=10,
        blank=True,
        help_text=_('Cinq derniers résultats, ex. "VVNDV" (le plus récent en dernier).'),
    )

    # Répartition domicile (GOAL API "homeLeague*", voir services.py).
    joues_domicile = models.PositiveSmallIntegerField(default=0)
    victoires_domicile = models.PositiveSmallIntegerField(default=0)
    nuls_domicile = models.PositiveSmallIntegerField(default=0)
    defaites_domicile = models.PositiveSmallIntegerField(default=0)
    buts_pour_domicile = models.PositiveSmallIntegerField(default=0)
    buts_contre_domicile = models.PositiveSmallIntegerField(default=0)
    points_domicile = models.PositiveSmallIntegerField(default=0)

    # Répartition extérieur (GOAL API "awayLeague*", voir services.py).
    joues_exterieur = models.PositiveSmallIntegerField(default=0)
    victoires_exterieur = models.PositiveSmallIntegerField(default=0)
    nuls_exterieur = models.PositiveSmallIntegerField(default=0)
    defaites_exterieur = models.PositiveSmallIntegerField(default=0)
    buts_pour_exterieur = models.PositiveSmallIntegerField(default=0)
    buts_contre_exterieur = models.PositiveSmallIntegerField(default=0)
    points_exterieur = models.PositiveSmallIntegerField(default=0)

    # Texte de zone qualificative/relégation tel que renvoyé par GOAL API (ex.
    # "Promotion - CAF Champions League (Qualification)", "Relegation - Ligue 2") — affiché
    # tel quel, jamais traduit côté backend (contenu variable non couvert par i18n Django).
    zone_texte = models.CharField(max_length=200, blank=True)

    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_classement_ligue"
        verbose_name = _("Classement de ligue")
        verbose_name_plural = _("Classements de ligue")
        ordering = ["saison", "rang"]
        constraints = [
            models.UniqueConstraint(
                fields=["saison", "equipe"], name="classement_saison_equipe_unique"
            )
        ]

    def __str__(self):
        return f"{self.rang}. {self.equipe} ({self.saison})"


class StatutRencontre(models.TextChoices):
    """Valeurs reprises telles quelles du champ `matchStatus` de GOAL API (voir
    services.py) — pas de traduction/remappage de valeur, seul le libellé humain change
    par langue (`get_statut_display()`)."""

    PROGRAMMEE = "SCHEDULED", _("Programmée")
    TERMINEE = "FINISHED", _("Terminée")
    REPORTEE = "POSTPONED", _("Reportée")
    ANNULEE = "CANCELLED", _("Annulée")


class RencontreCalendrier(models.Model):
    """Un match du calendrier de Club Africain (toutes compétitions confondues), synchronisé
    depuis GOAL API (goal-api.com) — distinct de `Match` ci-dessus, qui reste réservé aux
    matchs pilotés en direct par un modérateur (Live-Ticker). `evenement_externe_id`
    (identifiant GOAL API, ex. "cmxxxxxxxxxxxxxxxxxxxxxxxx") est la clé d'upsert idempotente.
    `score_domicile`/`score_exterieur` sont renseignés pour les matchs déjà joués, NULL sinon.

    Contrairement à SerpApi/Google Sports (qui ne renvoyait jamais que quelques matchs —
    derniers résultats + prochain match, voir ancienne docstring de tête services.py), GOAL
    API renvoie le calendrier COMPLET de l'équipe (198 rencontres testées par l'utilisateur,
    toutes compétitions) : `statut` (ex-inféré uniquement depuis `date_heure`/le score) est
    donc désormais fiable, notamment pour distinguer un match reporté/annulé d'un match à
    venir normal."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    evenement_externe_id = models.CharField(max_length=50, unique=True)
    competition = models.CharField(max_length=200, blank=True)
    equipe_domicile = models.CharField(max_length=200)
    equipe_exterieur = models.CharField(max_length=200)
    date_heure = models.DateTimeField()
    score_domicile = models.PositiveSmallIntegerField(null=True, blank=True)
    score_exterieur = models.PositiveSmallIntegerField(null=True, blank=True)
    statut = models.CharField(
        max_length=20, choices=StatutRencontre.choices, default=StatutRencontre.PROGRAMMEE
    )

    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_calendrier_rencontres"
        verbose_name = _("Rencontre au calendrier")
        verbose_name_plural = _("Calendrier des rencontres")
        ordering = ["date_heure"]
        indexes = [models.Index(fields=["date_heure"])]

    def __str__(self):
        return f"{self.equipe_domicile} vs {self.equipe_exterieur} — {self.date_heure:%Y-%m-%d}"

    @property
    def est_a_venir(self) -> bool:
        from django.utils import timezone

        return self.statut == StatutRencontre.PROGRAMMEE and self.date_heure >= timezone.now()


class StatistiqueJoueur(models.Model):
    """Statistiques individuelles d'un joueur (saison en cours), synchronisées depuis GOAL
    API (`GET /v1/teams/{id}/players`, voir services.py) — alimente les listes Torschützen
    (buts)/Kartenstatistik (cartons) de l'onglet Statistiken, absentes du module tant qu'il
    reposait sur SerpApi/Google Sports (aucune donnée joueur disponible pour la Ligue 1
    tunisienne sur ce fournisseur, voir ancienne docstring de tête services.py).
    `goal_api_id` est la clé d'upsert idempotente."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    goal_api_id = models.CharField(max_length=50, unique=True)
    saison = models.CharField(max_length=20, help_text=_('Ex. "2025-2026".'))
    equipe = models.CharField(max_length=200)
    nom = models.CharField(max_length=200)
    numero = models.PositiveSmallIntegerField(null=True, blank=True)
    # Valeur brute GOAL API (ex. "Goalkeepers"/"Defenders"/"Midfielders"/"Forwards") —
    # traduite côté frontend (i18n), jamais remappée en dur côté backend.
    poste = models.CharField(max_length=50, blank=True)
    matchs_joues = models.PositiveSmallIntegerField(default=0)
    buts = models.PositiveSmallIntegerField(default=0)
    passes_decisives = models.PositiveSmallIntegerField(default=0)
    cartons_jaunes = models.PositiveSmallIntegerField(default=0)
    cartons_rouges = models.PositiveSmallIntegerField(default=0)

    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_statistiques_joueurs"
        verbose_name = _("Statistique joueur")
        verbose_name_plural = _("Statistiques joueurs")
        ordering = ["-buts", "nom"]

    def __str__(self):
        return f"{self.nom} ({self.equipe}, {self.saison})"


class EquipeInfo(models.Model):
    """Fiche d'identité de l'équipe suivie (Club Africain) — SINGLETON (une seule ligne,
    `pk` fixe `PK_UNIQUE`) : contrairement à `ClassementLigue`/`StatistiqueJoueur`, il n'y a
    qu'une seule équipe suivie ici, pas de raison d'accumuler une ligne par saison.
    Synchronisée depuis GOAL API (`GET /teams/{id}`, voir
    services.py::synchroniser_equipe_info) — alimente l'en-tête de l'onglet Statistiken
    (2026-09-24, retour utilisateur : "Team-Info der aktuellen Saison aus /teams/{id}
    extrahieren und oben in der Seite zeigen").

    ⚠️ NON VÉRIFIÉ (2026-09-24) : contrairement aux trois endpoints standings/fixtures/
    players (curl-testés par l'utilisateur avec sa clé réelle, voir docstring de tête
    services.py), `GET /teams/{id}` lui-même n'a JAMAIS été appelé avec une clé réelle au
    moment de cette implémentation — mapping des champs fait par analogie avec les
    endpoints confirmés (mêmes conventions de nommage `_valeur()`-style) et avec l'usage
    courant des API sportives (nom/logo/stade/entraîneur/année de fondation), PAS sur une
    réponse brute observée. `donnees_brutes` conserve donc la réponse JSON telle quelle :
    en cas de mapping incorrect une fois la clé réelle utilisée (même mésaventure que le
    classement standings, voir tête de services.py — la première tentative de mapping
    standings avait synchronisé des colonnes à zéro), une correction pourra relire cette
    colonne sans attendre un nouveau cycle de synchronisation."""

    PK_UNIQUE = 1

    id = models.PositiveSmallIntegerField(primary_key=True, default=PK_UNIQUE, editable=False)

    nom = models.CharField(max_length=200, blank=True)
    logo_url = models.URLField(max_length=500, blank=True)
    fondee_en = models.PositiveSmallIntegerField(null=True, blank=True)
    stade = models.CharField(max_length=200, blank=True)
    ville = models.CharField(max_length=200, blank=True)
    pays = models.CharField(max_length=100, blank=True)
    entraineur = models.CharField(max_length=200, blank=True)
    donnees_brutes = models.JSONField(
        default=dict,
        blank=True,
        help_text=_(
            "Réponse GOAL API brute (`GET /teams/{id}`) telle quelle — filet de sécurité "
            "en cas de mapping de champ incorrect, voir docstring de classe."
        ),
    )

    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_equipe_info"
        verbose_name = _("Informations équipe")
        verbose_name_plural = _("Informations équipe")

    def __str__(self):
        return self.nom or "Équipe (non synchronisée)"


class TypeEvenementMatch(models.TextChoices):
    COUP_ENVOI = "coup_envoi", _("Coup d'envoi")
    BUT = "but", _("But")
    CARTON_JAUNE = "carton_jaune", _("Carton jaune")
    CARTON_ROUGE = "carton_rouge", _("Carton rouge")
    REMPLACEMENT = "remplacement", _("Remplacement")
    MI_TEMPS = "mi_temps", _("Mi-temps")
    FIN_MATCH = "fin_match", _("Fin du match")


class EquipeEvenement(models.TextChoices):
    CA = "ca", _("Club Africain")
    ADVERSAIRE = "adversaire", _("Adversaire")


class MatchEvenement(models.Model):
    """Journal d'événements du Live-Ticker (buts/cartons/etc.) — saisi par un modérateur
    (Bureau Admin+, voir MatchEvenementPermission), diffusé en direct via
    `LiveMatchConsumer` (nouveau group handler `match_evenement`, voir consumers.py)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="evenements")
    type_evenement = models.CharField(max_length=20, choices=TypeEvenementMatch.choices)
    minute = models.PositiveSmallIntegerField()
    equipe = models.CharField(max_length=10, choices=EquipeEvenement.choices, blank=True)
    joueur = models.CharField(max_length=200, blank=True)
    description = models.CharField(max_length=255, blank=True)

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="match_evenements_crees"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_match_evenements"
        verbose_name = _("Événement de match")
        verbose_name_plural = _("Événements de match")
        ordering = ["minute", "created_at"]
        indexes = [models.Index(fields=["match", "minute"])]

    def __str__(self):
        return f"{self.get_type_evenement_display()} {self.minute}' @ {self.match_id}"


# ---------------------------------------------------------------------------
# Tippspiel (pronostics Ligue 1) — module Fan-Club, ajouté le 2026-09-24 (retour
# utilisateur : jeu de pronostics sur les rencontres Ligue 1 de Club Africain, avec
# classement, frais de participation optionnels et lots à définir par l'Administrateur
# App). Périmètre volontairement limité aux rencontres de `RencontreCalendrier` dont
# `competition == "Ligue 1"` (décision utilisateur explicite, voir AskUserQuestion du
# 2026-09-24 : pas toute la Ligue 1, seulement les rencontres de Club Africain déjà
# synchronisées — pas de nouvel appel GOAL API `/leagues/{id}/fixtures`, voir
# services.py). Système de paiement volontairement autonome (décision utilisateur
# explicite, même AskUserQuestion : pas de réutilisation de `apps.cotisations.
# Cotisation`) : un simple statut payé/non payé confirmé manuellement par le Directeur
# Financier, sans passerelle de paiement en ligne — voir StatutPaiementTeilnahme.
# ---------------------------------------------------------------------------


class StatutTippspiel(models.TextChoices):
    """`brouillon` : créé par l'Administrateur App mais pas encore visible des membres
    ("Anzeigbar nachdem es eingestellt und veröffentlicht wird", retour utilisateur — la
    création et la publication sont deux étapes distinctes, voir TippspielPermission/
    TippspielViewSet.get_queryset). `publie` : visible et ouvert à la participation.
    `cloture` : terminé (plus de nouveaux pronostics possibles) — reste visible en
    lecture seule pour consulter le classement final."""

    BROUILLON = "brouillon", _("Brouillon")
    PUBLIE = "publie", _("Publié")
    CLOTURE = "cloture", _("Clôturé")


class Tippspiel(models.Model):
    """Un jeu de pronostics (typiquement un par saison) — créé exclusivement par
    l'Administrateur App ("Nur der App Admin kann das Spiel einstellen", retour
    utilisateur, voir TippspielPermission). `regles` est affiché côté frontend comme
    rappel/indice ("Spielregeln als Hint zur Verfügung stellen"). Barème de points fixe
    (non configurable, retour utilisateur donne des valeurs précises) : résultat exact
    4 points, tordifférence correcte (avec vainqueur identique) 2 points, tendance
    correcte (vainqueur/nul) seule 1 point, sinon 0 — voir
    services.py::_points_tip. `montant_participation` NULL = jeu gratuit (toute
    `TippspielTeilnahme` y est alors immédiatement confirmée, voir
    TippspielTeilnahme.statut_paiement)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre = models.CharField(max_length=200)
    saison = models.CharField(max_length=20, help_text=_('Ex. "2026-2027".'))
    regles = models.TextField(
        blank=True, help_text=_("Affiché aux membres comme rappel du barème de points.")
    )
    statut = models.CharField(
        max_length=20, choices=StatutTippspiel.choices, default=StatutTippspiel.BROUILLON
    )
    montant_participation = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text=_("Vide = jeu gratuit."),
    )

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="tippspiele_crees"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_tippspiele"
        verbose_name = _("Tippspiel")
        verbose_name_plural = _("Tippspiele")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.titre} ({self.saison})"

    @property
    def est_payant(self) -> bool:
        return self.montant_participation is not None


class TypePrixTippspiel(models.TextChoices):
    PRODUIT = "produit", _("Article boutique")
    MONTANT_FIXE = "montant_fixe", _("Montant fixe")
    POURCENTAGE = "pourcentage", _("Pourcentage de la cagnotte")


class TippspielPrix(models.Model):
    """Un lot pour un rang donné du classement final — défini à la création du
    Tippspiel par l'Administrateur App (voir docstring de tête Tippspiel). Trois formes
    possibles (voir TypePrixTippspiel), exactement les options citées par le retour
    utilisateur : un article de la Boutique, un montant fixe, ou un pourcentage de la
    cagnotte totale (somme des `montant_participation` des `TippspielTeilnahme`
    confirmées) — calculé à l'affichage, jamais stocké en dur."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tippspiel = models.ForeignKey(Tippspiel, on_delete=models.CASCADE, related_name="prix")
    platz = models.PositiveSmallIntegerField(help_text=_("1 = première place, etc."))
    type_prix = models.CharField(max_length=20, choices=TypePrixTippspiel.choices)
    # on_delete=PROTECT : un produit du catalogue référencé par un lot ne peut pas être
    # supprimé (même politique que Cotisation.article_catalogue) — related_name="+" :
    # aucun accès inverse nécessaire depuis Produit, pour ne pas polluer apps.boutique.
    produit = models.ForeignKey(
        "boutique.Produit",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text=_("Renseigné uniquement si type_prix=produit."),
    )
    montant = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Renseigné uniquement si type_prix=montant_fixe."),
    )
    pourcentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00")), MaxValueValidator(Decimal("100.00"))],
        help_text=_("Renseigné uniquement si type_prix=pourcentage (0-100)."),
    )

    class Meta:
        db_table = "communaute_tippspiel_prix"
        verbose_name = _("Lot Tippspiel")
        verbose_name_plural = _("Lots Tippspiel")
        ordering = ["tippspiel", "platz"]
        constraints = [
            models.UniqueConstraint(
                fields=["tippspiel", "platz"], name="tippspiel_prix_rang_unique"
            )
        ]

    def __str__(self):
        return f"{self.tippspiel.titre} — Platz {self.platz}"


class StatutPaiementTeilnahme(models.TextChoices):
    """Voir docstring de tête section Tippspiel : système de paiement autonome, sans
    passerelle en ligne — confirmation manuelle par le Directeur Financier uniquement
    ("die Teilnahme ist nur bestätigt, wenn der Beitrag eingegangen ist und bestätigt
    vom Finanzdirektor", retour utilisateur)."""

    SANS_FRAIS = "sans_frais", _("Sans frais")
    EN_ATTENTE = "en_attente", _("En attente de paiement")
    CONFIRMEE = "confirmee", _("Paiement confirmé")


class TippspielTeilnahmeManager(models.Manager):
    def rejoindre(self, tippspiel: "Tippspiel", membre):
        """Inscrit `membre` à `tippspiel` (idempotent — get_or_create) : statut initial
        `SANS_FRAIS` (jeu gratuit, confirmé d'emblée) ou `EN_ATTENTE` (jeu payant) selon
        `tippspiel.est_payant`. Appelée à la fois par l'action `teilnehmen` explicite
        (TippspielViewSet) ET implicitement à la création du tout premier pronostic
        (TippspielTipSerializer.create) — un membre qui pronostique sans avoir cliqué
        "Teilnehmen" au préalable ne doit jamais échouer."""
        return self.get_or_create(
            tippspiel=tippspiel,
            membre=membre,
            defaults={
                "statut_paiement": (
                    StatutPaiementTeilnahme.EN_ATTENTE
                    if tippspiel.est_payant
                    else StatutPaiementTeilnahme.SANS_FRAIS
                )
            },
        )


class TippspielTeilnahme(models.Model):
    """Inscription d'un membre à un Tippspiel — un membre ne peut s'inscrire qu'une fois
    par Tippspiel (contrainte unique), voir TippspielTeilnahmeManager.rejoindre.
    Soumettre un pronostic (`TippspielTip`) est bloqué tant que le paiement n'est pas
    confirmé pour un Tippspiel payant (revirement du 2026-09-24, retour utilisateur :
    "Für Beitragspflichtige Spiele, müssen Tipps verfügbar sein, nachdem die Bezahlung
    bestätigt wird" — voir TippspielTipSerializer.create) et SEULES les inscriptions
    `est_confirmee` apparaissent dans le classement (voir action `classement`,
    TippspielTeilnahmeViewSet) — condition explicite du retour utilisateur."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    tippspiel = models.ForeignKey(
        Tippspiel, on_delete=models.CASCADE, related_name="participations"
    )
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="tippspiel_participations"
    )
    statut_paiement = models.CharField(
        max_length=20,
        choices=StatutPaiementTeilnahme.choices,
        default=StatutPaiementTeilnahme.SANS_FRAIS,
    )
    confirmee_par = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tippspiel_paiements_confirmes",
    )
    confirmee_le = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = TippspielTeilnahmeManager()

    class Meta:
        db_table = "communaute_tippspiel_teilnahmen"
        verbose_name = _("Participation Tippspiel")
        verbose_name_plural = _("Participations Tippspiel")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["tippspiel", "membre"], name="tippspiel_teilnahme_membre_unique"
            )
        ]

    def __str__(self):
        return f"{self.membre} — {self.tippspiel.titre}"

    @property
    def est_confirmee(self) -> bool:
        return self.statut_paiement in (
            StatutPaiementTeilnahme.SANS_FRAIS,
            StatutPaiementTeilnahme.CONFIRMEE,
        )


class TippspielTip(models.Model):
    """Le pronostic d'un membre pour UNE rencontre — score exact prédit. `points` reste
    NULL tant que la rencontre n'est pas terminée ; recalculé après chaque
    synchronisation GOAL API (voir services.py::recalculer_points_tippspiel, appelé
    depuis synchroniser_donnees_football), jamais en direct ("Score Update muss nicht
    live sein, sondern nur nachdem Update der Daten aus der API", retour utilisateur).
    Modifiable jusqu'à la date-limite (1 jour avant le coup d'envoi, voir
    TippspielTipSerializer.validate) — au-delà, le serializer refuse toute
    création/modification, la ligne devient de facto en lecture seule."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    teilnahme = models.ForeignKey(
        TippspielTeilnahme, on_delete=models.CASCADE, related_name="tipps"
    )
    rencontre = models.ForeignKey(
        RencontreCalendrier, on_delete=models.CASCADE, related_name="tippspiel_tipps"
    )
    score_domicile = models.PositiveSmallIntegerField()
    score_exterieur = models.PositiveSmallIntegerField()
    points = models.PositiveSmallIntegerField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "communaute_tippspiel_tipps"
        verbose_name = _("Pronostic Tippspiel")
        verbose_name_plural = _("Pronostics Tippspiel")
        ordering = ["rencontre__date_heure"]
        constraints = [
            models.UniqueConstraint(
                fields=["teilnahme", "rencontre"], name="tippspiel_tip_rencontre_unique"
            )
        ]

    def __str__(self):
        return f"{self.teilnahme.membre} — {self.score_domicile}:{self.score_exterieur}"


# ---------------------------------------------------------------------------
# Albums photos (troisième lot, Phase 4B — voir docstring de tête)
# ---------------------------------------------------------------------------


def photo_album_upload_path(instance, filename):
    return f"albums/{instance.album_id}/{instance.id}/{filename}"


class Album(models.Model):
    """Album photos — gestion (créer/modifier/supprimer un album, y uploader des photos)
    réservée à Bureau Admin+ depuis le 2026-09-22 (retour utilisateur : "Im Modul Album,
    sollen Albums nur angezeigt werden. Die Verwaltung der Albums soll im Bereich Admin
    stattfinden") — voir AlbumPermission/PhotoPermission. Le module membre ("Albums photos")
    reste consultation seule (+ likes/commentaires/suppression de sa propre photo, qui ne
    sont pas de la "gestion" d'album). Avant cette date, la création était ouverte à tout
    membre authentifié ("upload collaboratif") — comportement abandonné sur demande."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    nom = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    # date/lieu (demande utilisateur du 2026-09-22, "Analog zum Modul Projekte eine
    # Beschreibung zu erfassen, das Datum und den Ort") : renseignés librement à la création
    # de l'album (l'album peut représenter un événement passé, une sortie improvisée, etc.),
    # donc optionnels — distincts du lien `evenement` ci-dessous, qui référence un Évènement
    # existant du module éponyme et reste géré uniquement via l'admin Django (aucun écran ne
    # permet de le choisir, voir get_evenement côté serializer).
    date = models.DateField(null=True, blank=True, verbose_name=_("Date"))
    lieu = models.CharField(max_length=255, blank=True, verbose_name=_("Lieu"))
    evenement = models.ForeignKey(
        "evenements.Evenement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="albums",
        help_text=_("Optionnel — un album peut ne pas être rattaché à un événement précis."),
    )
    createur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="albums_crees"
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_albums"
        verbose_name = _("Album")
        verbose_name_plural = _("Albums")
        ordering = ["-created_at"]

    def __str__(self):
        return self.nom

    @property
    def nombre_photos(self) -> int:
        return self.photos.filter(est_masquee=False).count()


class Photo(models.Model):
    """Photo d'un album — `image` toujours écrite via `validators
    .valider_et_reencoder_photo` (voir serializers.py), jamais les octets bruts du client."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name="photos")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="photos_album"
    )
    image = models.ImageField(upload_to=photo_album_upload_path, storage=AlbumsStorage())
    legende = models.CharField(max_length=255, blank=True)

    est_masquee = models.BooleanField(
        default=False, help_text=_("Modération admin — soft-hide, préserve l'historique.")
    )
    masquee_par = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="photos_masquees",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_photos"
        verbose_name = _("Photo")
        verbose_name_plural = _("Photos")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["album", "est_masquee", "-created_at"])]

    def __str__(self):
        return f"{self.membre} — {self.album_id}"


class PhotoLike(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    photo = models.ForeignKey(Photo, on_delete=models.CASCADE, related_name="likes")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="likes_photo"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_photo_likes"
        constraints = [
            models.UniqueConstraint(
                fields=["photo", "membre"], name="un_seul_like_par_membre_photo"
            )
        ]

    def __str__(self):
        return f"{self.membre} ♥ {self.photo_id}"


class PhotoCommentaire(models.Model):
    """Commentaire à plat (pas de réponse imbriquée — non documenté pour ce sous-module,
    contrairement au Fil d'actualité)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    photo = models.ForeignKey(Photo, on_delete=models.CASCADE, related_name="commentaires")
    auteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="commentaires_photo"
    )
    contenu = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_photo_commentaires"
        verbose_name = _("Commentaire de photo")
        verbose_name_plural = _("Commentaires de photo")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["photo", "created_at"])]

    def __str__(self):
        return f"{self.auteur} — {(self.contenu or '')[:30]}"


# ---------------------------------------------------------------------------
# Quiz (troisième lot, Phase 4B — voir docstring de tête)
# ---------------------------------------------------------------------------


class Quiz(models.Model):
    """Quiz mensuel — gestion (créer/publier les questions) réservée à Bureau Admin+, voir
    docstring de tête pour la justification de `est_actif` (convention d'usage, pas de
    contrainte DB)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    est_actif = models.BooleanField(
        default=False,
        help_text=_(
            "Un seul quiz actif proposé aux membres à la fois (convention d'usage côté "
            "admin, pas de contrainte DB — voir docstring de tête)."
        ),
    )

    created_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="quiz_crees"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_quiz"
        verbose_name = _("Quiz")
        verbose_name_plural = _("Quiz")
        ordering = ["-created_at"]

    def __str__(self):
        return self.titre


class QuestionQuiz(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    texte = models.CharField(max_length=500)
    ordre = models.PositiveSmallIntegerField(default=0)
    points = models.PositiveSmallIntegerField(
        default=100, help_text=_("Points attribués si la bonne réponse est sélectionnée.")
    )

    class Meta:
        db_table = "communaute_quiz_questions"
        verbose_name = _("Question de quiz")
        verbose_name_plural = _("Questions de quiz")
        ordering = ["ordre"]
        indexes = [models.Index(fields=["quiz", "ordre"])]

    def __str__(self):
        return self.texte


class ChoixQuestion(models.Model):
    """Une option proposée pour une question — `est_correct` n'est JAMAIS exposé au
    frontend avant réponse, voir serializers.QuestionQuizSerializer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    question = models.ForeignKey(QuestionQuiz, on_delete=models.CASCADE, related_name="choix")
    texte = models.CharField(max_length=255)
    est_correct = models.BooleanField(default=False)

    class Meta:
        db_table = "communaute_quiz_choix"
        verbose_name = _("Choix de question")
        verbose_name_plural = _("Choix de question")

    def __str__(self):
        return self.texte


class ParticipationQuiz(models.Model):
    """Une participation d'un membre à un quiz — au plus une par (quiz, membre), voir
    docstring de tête."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="participations")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="participations_quiz"
    )

    score = models.PositiveIntegerField(default=0)
    demarree_le = models.DateTimeField(auto_now_add=True)
    terminee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "communaute_quiz_participations"
        verbose_name = _("Participation quiz")
        verbose_name_plural = _("Participations quiz")
        constraints = [
            models.UniqueConstraint(fields=["quiz", "membre"], name="une_participation_par_membre")
        ]
        # Classement (mockup "Classement quiz") : score décroissant, temps de complétion
        # croissant pour départager (les valeurs NULL — pas encore terminé — sont triées en
        # dernier par PostgreSQL par défaut pour un ordre ASC, ce qui est le comportement
        # voulu : une participation en cours n'est jamais classée devant une déjà terminée à
        # score égal). Voir docstring de tête pour la justification de ce départage.
        ordering = ["-score", "terminee_le"]

    def __str__(self):
        return f"{self.membre} — {self.quiz} ({self.score} pts)"

    @property
    def temps_total_secondes(self):
        if self.terminee_le is None:
            return None
        return (self.terminee_le - self.demarree_le).total_seconds()


class ReponseQuiz(models.Model):
    """Une réponse donnée par un membre à une question — `est_correct`/`points_obtenus`
    TOUJOURS recalculés côté serveur (CLAUDE.md §8), jamais transmis par le client."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    participation = models.ForeignKey(
        ParticipationQuiz, on_delete=models.CASCADE, related_name="reponses"
    )
    question = models.ForeignKey(QuestionQuiz, on_delete=models.CASCADE, related_name="reponses")
    choix = models.ForeignKey(ChoixQuestion, on_delete=models.CASCADE, related_name="reponses")

    est_correct = models.BooleanField()
    points_obtenus = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_quiz_reponses"
        verbose_name = _("Réponse de quiz")
        verbose_name_plural = _("Réponses de quiz")
        constraints = [
            models.UniqueConstraint(
                fields=["participation", "question"], name="une_reponse_par_question"
            )
        ]

    def __str__(self):
        return f"{self.participation_id} — Q{self.question_id}"

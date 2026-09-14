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
  - `Album` : création ouverte à tout membre authentifié (mockup : le modal d'ajout de
    photo propose "Nouveau album…" directement — "upload collaboratif" au sens le plus
    large, pas réservé aux admins), rattachement optionnel à un `apps.evenements.Evenement`.
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

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_messages_prives"
        verbose_name = _("Message privé")
        verbose_name_plural = _("Messages privés")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["conversation", "created_at"])]

    def __str__(self):
        return f"{self.expediteur} @ {self.conversation_id}"


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

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "communaute_messages_groupe"
        verbose_name = _("Message de groupe")
        verbose_name_plural = _("Messages de groupe")
        ordering = ["created_at"]
        indexes = [models.Index(fields=["groupe", "created_at"])]

    def __str__(self):
        return f"{self.auteur} @ {self.groupe_id}"


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
# Albums photos (troisième lot, Phase 4B — voir docstring de tête)
# ---------------------------------------------------------------------------


def photo_album_upload_path(instance, filename):
    return f"albums/{instance.album_id}/{instance.id}/{filename}"


class Album(models.Model):
    """Album photos — voir docstring de tête ("upload collaboratif" : création ouverte à
    tout membre authentifié)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    nom = models.CharField(max_length=200)
    description = models.TextField(blank=True)
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
            models.UniqueConstraint(
                fields=["quiz", "membre"], name="une_participation_par_membre"
            )
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

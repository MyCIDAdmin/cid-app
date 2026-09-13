"""
Modèles — app communaute (Phase 4A, R2).

Premier lot du module Communauté (Release Plan §3.2) : **Fil d'actualité** et **Forum**,
choisis comme point de départ de la Phase 4 car purement REST/CRUD — sans WebSocket ni
chiffrement — à la différence de Messagerie privée / Groupes de chat (qui nécessitent
Django Channels + AES-256, voir apps.vote pour l'infra WebSocket déjà en place) et Live
Match. Ce second lot suivra dans une phase ultérieure (voir CLAUDE.md §7, Phase 4A/4B).

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
"""

import re
import uuid

from django.db import models
from django.utils.translation import gettext_lazy as _

from .storage import PublicationsStorage

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

"""
Modèles — app vote.

R1 P1 — Sessions temps réel, WebSocket Django Channels, anonymat HMAC-SHA256 (FDD §3.5,
§5.2, SDD §2.3, SCD §7.5, RICEFW E-002/E-006/E-007/F-008/F-009/W-006, Timeline Phase 3
S11-12).

Vue d'ensemble du flux (SDD §2.3) :
  1. Un Bureau Admin+ crée une VoteSession (POST /votes/, "lancement immédiat" — RICEFW
     W-006 : pas d'état brouillon, la session est ouverte dès sa création) avec ses
     VoteOption. `anonymat_sel` (sel cryptographique, 64 caractères aléatoires, propre à
     chaque session) est généré à la création et stocké chiffré (EncryptedCharField).
  2. Les membres se connectent au WebSocket ws://app/ws/votes/{id}/?token=JWT
     (apps.vote.consumers.VoteConsumer) et soumettent leur bulletin via le canal
     (receive_json), pas via un endpoint REST — voir consumers.py.
  3. Le vote calcule voter_token = HMAC-SHA256(clé=anonymat_sel, msg="{membre_id}:
     {session_id}") (apps.vote.security.compute_voter_token) et vérifie qu'aucun
     VoteExprime n'existe déjà avec ce voter_token_hash pour cette session avant insertion
     (0 double vote possible, sans jamais relier le vote au membre — SCD §7.5).
  4. Un ParticipationVote (session, membre) n'est créé QUE si mode_anonymat = NOMINATIF —
     il trace uniquement "a voté / n'a pas voté" (jamais le choix), pour vérifier le quorum
     sans trahir le secret du vote (SCD §7.5). En mode ANONYME, rien ne relie jamais un
     membre à sa participation.
  5. Celery Beat (apps.vote.tasks.clore_sessions_expirees, chaque minute) clôture les
     sessions dont date_fin est dépassée, calcule les résultats agrégés et diffuse
     resultats_disponibles au groupe WebSocket de la session.
"""

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _
from encrypted_model_fields.fields import EncryptedCharField


class TypeVote(models.TextChoices):
    """FDD §3.5/§5.2 — 4 types de vote pris en charge."""

    UNIQUE = "unique", _("Choix unique")
    MULTIPLE = "multiple", _("Choix multiple")
    OUI_NON = "oui_non", _("Oui / Non")
    PREFERENTIEL = "preferentiel", _("Vote préférentiel")


class ModeAnonymat(models.TextChoices):
    """Mockup #m-create-vote step 1 — radio "Vote anonyme" (défaut) / "Vote nominatif"
    (SCD §7.5 : en nominatif, seule la participation est traçable par un admin, jamais le
    choix — voir ParticipationVote)."""

    ANONYME = "anonyme", _("Anonyme")
    NOMINATIF = "nominatif", _("Nominatif")


class EligibiliteVote(models.TextChoices):
    """Mockup #m-create-vote step 1 — sélecteur "Membres éligibles"."""

    TOUS_ACTIFS = "tous_actifs", _("Tous les membres actifs")
    COTISANTS = "cotisants", _("Membres cotisants de l'année en cours")
    BUREAU = "bureau", _("Bureau et modérateurs (Bureau Admin+)")
    SELECTION_MANUELLE = "selection_manuelle", _("Sélection manuelle")


class StatutSession(models.TextChoices):
    """RICEFW W-006 : une session de vote est lancée immédiatement à sa création (pas
    d'état brouillon, contrairement à Evenement) — elle est OUVERTE jusqu'à sa clôture
    (manuelle par un Bureau Admin+, ou automatique par Celery Beat à expiration)."""

    OUVERTE = "ouverte", _("Ouverte")
    CLOTUREE = "cloturee", _("Clôturée")


class VoteSession(models.Model):
    """Session de vote/élection en temps réel (FDD §3.5, F-008)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre = models.CharField(max_length=200)
    description = models.TextField(
        help_text=_("Objet du vote, règles, candidats éligibles — mockup #cv-desc.")
    )
    type_vote = models.CharField(max_length=20, choices=TypeVote.choices)
    mode_anonymat = models.CharField(
        max_length=20, choices=ModeAnonymat.choices, default=ModeAnonymat.ANONYME
    )
    nb_choix_max = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text=_("Nombre de choix autorisés — pertinent uniquement pour type_vote=multiple."),
    )

    eligibilite = models.CharField(
        max_length=30, choices=EligibiliteVote.choices, default=EligibiliteVote.TOUS_ACTIFS
    )
    membres_selectionnes = models.ManyToManyField(
        "membres.Membre",
        blank=True,
        related_name="votes_selection_manuelle",
        help_text=_("Utilisé uniquement si eligibilite=selection_manuelle."),
    )

    # Durée bornée par le FDD (§5.2/RPL) : "Sessions limitées (10min à 7j)".
    duree_minutes = models.PositiveIntegerField(
        validators=[MinValueValidator(10), MaxValueValidator(10080)]
    )
    quorum_pct = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text=_("% minimum de participation requis — null = pas de quorum."),
    )
    resultats_visibles_avant_cloture = models.BooleanField(
        default=False,
        help_text=_(
            "Réservé à un usage futur — SCD §7.5 impose que l'API résultats masque "
            "systématiquement les comptages tant que statut != cloturee, quelle que soit "
            "la valeur de ce champ (voir VoteSessionViewSet.resultats)."
        ),
    )

    # SCD §7.5 : sel cryptographique unique par session, stocké chiffré. `unique=True`
    # garantit qu'un même sel n'est jamais réutilisé (chaque session a son propre espace
    # cryptographique) — bien que EncryptedCharField chiffre la valeur en base, l'unicité
    # est vérifiée par Django au niveau de la valeur en clair avant chiffrement.
    anonymat_sel = EncryptedCharField(max_length=128, editable=False)

    statut = models.CharField(
        max_length=20, choices=StatutSession.choices, default=StatutSession.OUVERTE
    )
    date_ouverture = models.DateTimeField(auto_now_add=True)
    date_fin = models.DateTimeField(
        help_text=_("date_ouverture + duree_minutes — calculé à la création, jamais côté client.")
    )
    date_cloture = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sessions_vote_creees",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "vote_sessions"
        verbose_name = _("Session de vote")
        verbose_name_plural = _("Sessions de vote")
        ordering = ["-date_ouverture"]
        indexes = [
            models.Index(fields=["statut", "date_fin"]),
        ]

    def __str__(self):
        return self.titre

    @property
    def resultats_visibles(self) -> bool:
        """SCD §7.5 — les résultats agrégés ne sont JAMAIS exposés avant la clôture,
        indépendamment de `resultats_visibles_avant_cloture` (voir son docstring)."""
        return self.statut == StatutSession.CLOTUREE


class VoteOption(models.Model):
    """Option ou candidat soumis au vote (FDD §5.2 : "photo, biographie courte, programme"
    — photo hors périmètre de cette implémentation backend, voir description)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(VoteSession, on_delete=models.CASCADE, related_name="options")
    label = models.CharField(max_length=200)
    description = models.TextField(blank=True, help_text=_("Biographie / programme — optionnel."))
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "vote_options"
        verbose_name = _("Option de vote")
        verbose_name_plural = _("Options de vote")
        ordering = ["ordre", "label"]

    def __str__(self):
        return f"{self.label} ({self.session_id})"


class VoteExprime(models.Model):
    """Un bulletin soumis — ne contient JAMAIS de référence au membre votant (SCD §7.5) :
    seul `voter_token_hash` (irréversible) permet de détecter un doublon. Le choix
    (VoteOption(s) sélectionnée(s)) est porté par ChoixExprime."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(VoteSession, on_delete=models.CASCADE, related_name="bulletins")
    voter_token_hash = models.CharField(max_length=64, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "vote_exprimes"
        verbose_name = _("Bulletin exprimé")
        verbose_name_plural = _("Bulletins exprimés")
        constraints = [
            models.UniqueConstraint(
                fields=["session", "voter_token_hash"], name="unique_voter_token_par_session"
            )
        ]

    def __str__(self):
        return f"Bulletin {self.id} — session {self.session_id}"


class ChoixExprime(models.Model):
    """Une option choisie au sein d'un bulletin. `rang` n'est renseigné que pour
    type_vote=preferentiel (1 = premier choix, 2 = second choix, ...) ; il vaut 0 pour les
    autres types (unique/multiple/oui_non ne comportent pas de classement)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bulletin = models.ForeignKey(VoteExprime, on_delete=models.CASCADE, related_name="choix")
    option = models.ForeignKey(VoteOption, on_delete=models.CASCADE, related_name="choix_recus")
    rang = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "vote_choix_exprimes"
        verbose_name = _("Choix exprimé")
        verbose_name_plural = _("Choix exprimés")

    def __str__(self):
        return f"{self.option_id} (rang {self.rang})"


class ParticipationVote(models.Model):
    """SCD §7.5 — audit trail de participation, créé UNIQUEMENT si
    session.mode_anonymat = NOMINATIF, et UNIQUEMENT en plus (jamais à la place) du
    VoteExprime anonyme correspondant. Ne porte jamais le choix du membre : sert
    exclusivement à vérifier le quorum et "qui a voté" sans trahir le secret du vote."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        VoteSession, on_delete=models.CASCADE, related_name="participations"
    )
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="participations_vote"
    )
    voted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "vote_participations"
        verbose_name = _("Participation (nominatif)")
        verbose_name_plural = _("Participations (nominatif)")
        constraints = [
            models.UniqueConstraint(
                fields=["session", "membre"], name="unique_participation_membre"
            )
        ]

    def __str__(self):
        return f"{self.membre_id} a voté — session {self.session_id}"

"""
Modèles — app evenements.

R1 P1 — CRUD événements, inscriptions, covoiturage (FDD §3.4 périmètre, RICEFW
F-005/F-006/F-007, R-004, W-004/W-005).

Périmètre de ce module (Phase 2A, CLAUDE.md §7 — modèles + API uniquement) :
  - Evenement : créé/publié par le Bureau Admin+ (FDD §2.2), consultable par tout membre
    authentifié une fois publié.
  - Inscription : un membre s'inscrit à un événement (places, régime alimentaire,
    remarques) — capacité vérifiée et décrémentée atomiquement (SELECT FOR UPDATE, même
    principe que le stock boutique) pour éviter toute survente en cas de requêtes
    concurrentes. Le montant est toujours recalculé côté serveur (CLAUDE.md §8) :
    montant = evenement.cout * places, jamais fait confiance au frontend.
  - Covoiturage / ReservationCovoiturage : un membre propose un trajet (éventuellement
    rattaché à un événement), d'autres le rejoignent — places disponibles décrémentées
    du même principe atomique.
  - Rappels Celery Beat J-3/J-1 (W-005) et emails d'invitation (W-004) sont implémentés en
    Phase 2B — voir tasks.py. Rapport d'activité (R-004) et pages React restent hors
    périmètre (Phase 2B suite/apps.stats pour R-004, voir CLAUDE.md §7).
"""

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _


class TypeEvenement(models.TextChoices):
    """Mockup #pg-admin-events — liste déroulante "Type"."""

    DEPLACEMENT = "deplacement", _("Déplacement")
    FETE = "fete", _("Fête / Rassemblement")
    CONFERENCE = "conference", _("AMA / Conférence")
    TOURNOI = "tournoi", _("Tournoi")
    AG = "ag", _("Assemblée Générale")


class StatutEvenement(models.TextChoices):
    """Mockup : bouton "Publier l'événement" — un événement est d'abord en brouillon
    (visible seulement au Bureau Admin+), publié pour devenir visible à tous, ou annulé."""

    BROUILLON = "brouillon", _("Brouillon")
    PUBLIE = "publie", _("Publié")
    ANNULE = "annule", _("Annulé")


class RegimeAlimentaire(models.TextChoices):
    """Mockup #m-inscription — sélecteur "Régime alimentaire"."""

    AUCUN = "aucun", _("Aucun")
    HALAL = "halal", _("Halal")
    VEGETARIEN = "vegetarien", _("Végétarien")


class Evenement(models.Model):
    """Événement associatif (déplacement, fête, conférence...) — FDD §3.4, F-005."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    titre = models.CharField(max_length=200)
    type_evenement = models.CharField(max_length=20, choices=TypeEvenement.choices)
    description = models.TextField()

    date_evenement = models.DateField()
    heure = models.TimeField(null=True, blank=True)
    lieu = models.CharField(max_length=255, help_text=_("Stade/salle, ville, adresse complète."))
    point_rdv = models.CharField(max_length=255, blank=True)

    places_max = models.PositiveIntegerField(
        null=True, blank=True, help_text=_("Vide = pas de limite de capacité.")
    )
    gratuit = models.BooleanField(default=False)
    cout = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Ignoré (toujours 0) si gratuit=True — voir Evenement.save()."),
    )

    organisateur = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="evenements_organises",
    )
    statut = models.CharField(
        max_length=20, choices=StatutEvenement.choices, default=StatutEvenement.BROUILLON
    )

    created_by = models.ForeignKey(
        "membres.Membre",
        on_delete=models.PROTECT,
        related_name="evenements_crees",
        help_text=_("Traçabilité — SCD §7."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "evenements"
        verbose_name = _("Événement")
        verbose_name_plural = _("Événements")
        ordering = ["date_evenement", "heure"]
        indexes = [
            models.Index(fields=["statut", "date_evenement"]),
            models.Index(fields=["type_evenement"]),
        ]

    def __str__(self):
        return f"{self.titre} ({self.date_evenement})"

    def save(self, *args, **kwargs):
        if self.gratuit:
            self.cout = Decimal("0.00")
        super().save(*args, **kwargs)

    @property
    def places_reservees(self) -> int:
        """Somme des places des inscriptions actives (ni annulée) — jamais mise en cache,
        toujours recalculée pour rester exacte malgré des annulations concurrentes."""
        total = self.inscriptions.exclude(statut=StatutInscription.ANNULEE).aggregate(
            total=models.Sum("places")
        )["total"]
        return total or 0

    @property
    def places_restantes(self) -> int | None:
        if self.places_max is None:
            return None
        return max(self.places_max - self.places_reservees, 0)


class StatutInscription(models.TextChoices):
    EN_ATTENTE_PAIEMENT = "en_attente_paiement", _("En attente de paiement")
    CONFIRMEE = "confirmee", _("Confirmée")
    ANNULEE = "annulee", _("Annulée")


class Inscription(models.Model):
    """
    Inscription d'un membre à un événement — FDD F-006. Une seule ligne par (événement,
    membre) : re-soumettre le formulaire met à jour la même inscription plutôt que d'en
    créer une seconde (même convention que Souscription en adhésions).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    evenement = models.ForeignKey(Evenement, on_delete=models.CASCADE, related_name="inscriptions")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="inscriptions_evenements"
    )

    places = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    regime_alimentaire = models.CharField(
        max_length=20, choices=RegimeAlimentaire.choices, default=RegimeAlimentaire.AUCUN
    )
    remarques = models.TextField(blank=True)

    montant_paye = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Recalculé côté serveur = evenement.cout * places (CLAUDE.md §8)."),
    )
    statut = models.CharField(
        max_length=20, choices=StatutInscription.choices, default=StatutInscription.CONFIRMEE
    )

    cotisation = models.ForeignKey(
        "cotisations.Cotisation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="inscription_evenement",
        help_text=_("Écriture de paiement liée, une fois l'inscription payante réglée."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "evenements_inscriptions"
        verbose_name = _("Inscription")
        verbose_name_plural = _("Inscriptions")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["evenement", "membre"], name="une_seule_inscription_par_membre_evenement"
            )
        ]
        indexes = [models.Index(fields=["evenement", "statut"])]

    def __str__(self):
        return f"{self.membre} — {self.evenement.titre}"


class Covoiturage(models.Model):
    """Trajet proposé par un membre — FDD F-007, éventuellement rattaché à un événement."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    conducteur = models.ForeignKey(
        "membres.Membre", on_delete=models.CASCADE, related_name="trajets_proposes"
    )
    evenement = models.ForeignKey(
        Evenement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="trajets_covoiturage",
    )

    depart = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    date_trajet = models.DateField()
    heure_trajet = models.TimeField()
    lieu_rendez_vous = models.CharField(
        max_length=255,
        blank=True,
        help_text=_(
            "Point de rendez-vous fixé par le conducteur pour l'ensemble du trajet (« "
            "Treffpunkt », signalé par un utilisateur — 2026-09-25) — distinct du point de "
            "prise en charge propre à chaque passager (voir "
            "ReservationCovoiturage.point_prise_en_charge)."
        ),
    )

    places_disponibles = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    prix_par_place = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Vide = trajet gratuit."),
    )
    vehicule = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "evenements_covoiturages"
        verbose_name = _("Covoiturage")
        verbose_name_plural = _("Covoiturages")
        ordering = ["date_trajet", "heure_trajet"]
        indexes = [models.Index(fields=["date_trajet"])]

    def __str__(self):
        return f"{self.depart} → {self.destination} ({self.date_trajet})"

    @property
    def places_reservees(self) -> int:
        total = self.reservations.exclude(statut=StatutReservationCovoiturage.ANNULEE).aggregate(
            total=models.Sum("places_reservees")
        )["total"]
        return total or 0

    @property
    def places_restantes(self) -> int:
        return max(self.places_disponibles - self.places_reservees, 0)


class StatutReservationCovoiturage(models.TextChoices):
    CONFIRMEE = "confirmee", _("Confirmée")
    ANNULEE = "annulee", _("Annulée")


class ReservationCovoiturage(models.Model):
    """Un membre rejoint un trajet de covoiturage proposé — FDD F-007 (mockup #m-rejoindre)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    trajet = models.ForeignKey(Covoiturage, on_delete=models.CASCADE, related_name="reservations")
    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="reservations_covoiturage"
    )

    places_reservees = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    point_prise_en_charge = models.CharField(max_length=255, blank=True)
    statut = models.CharField(
        max_length=20,
        choices=StatutReservationCovoiturage.choices,
        default=StatutReservationCovoiturage.CONFIRMEE,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "evenements_reservations_covoiturage"
        verbose_name = _("Réservation covoiturage")
        verbose_name_plural = _("Réservations covoiturage")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["trajet", "membre"], name="une_seule_reservation_par_membre_trajet"
            )
        ]

    def __str__(self):
        return f"{self.membre} — {self.trajet}"

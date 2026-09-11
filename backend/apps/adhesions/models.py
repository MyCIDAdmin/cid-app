"""
Modèles — app adhesions.

R1 P0 — Campagnes annuelles, offres (Basic/Plus/Junior), rabais + justificatifs, historique
immuable (FDD §3.3, TDD §4, RICEFW ADH-xx).

Périmètre de ce module (AHM-19) :
  - CampagneAdhesion / OffreAdhesion / RabaisOffre forment le catalogue administré par le
    Bureau (FDD §6.1) : une campagne annuelle regroupe des offres, chacune pouvant porter
    plusieurs rabais (étudiant, famille, etc.), chacun nécessitant ou non un justificatif.
  - Souscription est l'écriture d'inscription d'un membre à une offre, avec recalcul serveur
    du prix (CLAUDE.md §8) et un instantané (snapshot_avantages) des avantages de l'offre au
    moment de la souscription — pour que l'historique reste exact même si l'offre évolue par
    la suite (FDD §6.1 : "l'avantage souscrit ne doit jamais changer rétroactivement").
  - JustificatifRabais (upload MinIO, validation RH, URLs pré-signées) est volontairement HORS
    périmètre de ce ticket — voir AHM-20. De même, la génération de reçu PDF, les tâches Celery
    Beat de relance/clôture automatique, les endpoints stats/export et les emails de
    notification sont différés à des tickets ultérieurs (mêmes principes que la scission
    cotisations AHM-15 → AHM-17/AHM-18).
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class StatutCampagne(models.TextChoices):
    """Cycle de vie d'une campagne — FDD §6.1 (assistant de création en 4 étapes, AHM-21)."""

    BROUILLON = "brouillon", _("Brouillon")
    PUBLIEE = "publiee", _("Publiée")
    CLOTUREE = "cloturee", _("Clôturée")


class CampagneAdhesion(models.Model):
    """Campagne annuelle d'adhésion — regroupe les offres proposées pour une année donnée."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    nom = models.CharField(max_length=200)
    annee = models.PositiveSmallIntegerField()
    date_debut = models.DateField()
    date_fin = models.DateField()
    description = models.TextField(blank=True)
    statut = models.CharField(
        max_length=20, choices=StatutCampagne.choices, default=StatutCampagne.BROUILLON
    )

    created_by = models.ForeignKey(
        "membres.Membre",
        on_delete=models.PROTECT,
        related_name="campagnes_creees",
        help_text=_("Membre du Bureau ayant créé la campagne (traçabilité — SCD §7)."),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "adhesions_campagnes"
        verbose_name = _("Campagne d'adhésion")
        verbose_name_plural = _("Campagnes d'adhésion")
        ordering = ["-annee", "-created_at"]
        constraints = [
            # Une seule campagne publiée par année (FDD §6.1) — brouillons et campagnes
            # clôturées de la même année restent possibles (historique, préparation N+1).
            models.UniqueConstraint(
                fields=["annee"],
                condition=models.Q(statut=StatutCampagne.PUBLIEE),
                name="une_seule_campagne_publiee_par_annee",
            )
        ]
        indexes = [models.Index(fields=["annee", "statut"])]

    def __str__(self):
        return f"{self.nom} ({self.annee}) — {self.get_statut_display()}"


class OffreAdhesion(models.Model):
    """Offre d'adhésion (ex. Basic/Plus/Junior) rattachée à une campagne — FDD §6.1."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    campagne = models.ForeignKey(CampagneAdhesion, on_delete=models.CASCADE, related_name="offres")

    nom = models.CharField(max_length=200)
    prix_plein = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    description = models.TextField(blank=True)
    avantages = models.JSONField(
        default=list,
        blank=True,
        help_text=_(
            "Liste ordonnée d'avantages trilingues : "
            '[{"ordre": 1, "texte_fr": "...", "texte_de": "...", "texte_ar": "..."}, ...].'
        ),
    )

    condition_age_min = models.PositiveSmallIntegerField(null=True, blank=True)
    condition_age_max = models.PositiveSmallIntegerField(null=True, blank=True)

    visible = models.BooleanField(
        default=True, help_text=_("Décoché : offre gardée au catalogue mais masquée côté membre.")
    )
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "adhesions_offres"
        verbose_name = _("Offre d'adhésion")
        verbose_name_plural = _("Offres d'adhésion")
        ordering = ["campagne", "ordre", "nom"]
        indexes = [models.Index(fields=["campagne", "visible"])]

    def __str__(self):
        return f"{self.nom} — {self.campagne.nom}"

    def eligible_pour_age(self, age: int) -> bool:
        """Éligibilité dynamique à l'âge (FDD §6.1) — jamais stockée, voir Membre.age."""
        if self.condition_age_min is not None and age < self.condition_age_min:
            return False
        if self.condition_age_max is not None and age > self.condition_age_max:
            return False
        return True


class TypeRabais(models.TextChoices):
    ETUDIANT = "etudiant", _("Étudiant")
    FAMILLE = "famille", _("Famille")
    SENIOR = "senior", _("Senior")
    AUTRE = "autre", _("Autre")


class RabaisOffre(models.Model):
    """Rabais applicable à une offre — montant et pourcentage mutuellement exclusifs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    offre = models.ForeignKey(OffreAdhesion, on_delete=models.CASCADE, related_name="rabais")

    type_rabais = models.CharField(max_length=20, choices=TypeRabais.choices)
    label_fr = models.CharField(max_length=200)
    label_de = models.CharField(max_length=200, blank=True)
    label_ar = models.CharField(max_length=200, blank=True)

    montant_reduction = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    pct_reduction = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )

    justificatif_requis = models.BooleanField(default=False)
    instructions_fr = models.TextField(blank=True)
    instructions_de = models.TextField(blank=True)
    instructions_ar = models.TextField(blank=True)

    class Meta:
        db_table = "adhesions_rabais"
        verbose_name = _("Rabais")
        verbose_name_plural = _("Rabais")
        ordering = ["offre", "type_rabais"]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(montant_reduction__isnull=False, pct_reduction__isnull=True)
                    | models.Q(montant_reduction__isnull=True, pct_reduction__isnull=False)
                ),
                name="rabais_montant_xor_pourcentage",
            )
        ]

    def __str__(self):
        return f"{self.label_fr} — {self.offre.nom}"

    def calculer_prix(self, prix_plein: Decimal) -> Decimal:
        """Calcul serveur du prix réduit (CLAUDE.md §8) — jamais fait confiance au frontend."""
        if self.montant_reduction is not None:
            prix = prix_plein - self.montant_reduction
        else:
            prix = prix_plein * (Decimal("1") - self.pct_reduction / Decimal("100"))
        return max(prix, Decimal("0.00")).quantize(Decimal("0.01"))


class StatutSouscription(models.TextChoices):
    """Machine à états d'une souscription — FDD §6.1."""

    BROUILLON = "brouillon", _("Brouillon")
    EN_ATTENTE_JUSTIFICATIF = "en_attente_justificatif", _("En attente de justificatif")
    EN_ATTENTE_PAIEMENT = "en_attente_paiement", _("En attente de paiement")
    PAYEE = "payee", _("Payée")
    RABAIS_REFUSE = "rabais_refuse", _("Rabais refusé")
    ANNULEE = "annulee", _("Annulée")
    EXPIREE = "expiree", _("Expirée")


class Souscription(models.Model):
    """
    Souscription d'un membre à une offre d'adhésion — une seule par (membre, campagne) : un
    changement d'offre en cours de campagne met à jour cette même ligne plutôt que d'en créer
    une nouvelle (FDD §6.1). Une souscription payée ne peut jamais être supprimée (voir
    permissions.py/views.py — pas de DELETE exposé, registre append-only comme Cotisation).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    membre = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="souscriptions"
    )
    offre = models.ForeignKey(OffreAdhesion, on_delete=models.PROTECT, related_name="souscriptions")
    campagne = models.ForeignKey(
        CampagneAdhesion, on_delete=models.PROTECT, related_name="souscriptions"
    )

    date_souscription = models.DateTimeField(default=timezone.now)
    prix_paye = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    rabais = models.ForeignKey(
        RabaisOffre,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="souscriptions",
    )
    statut = models.CharField(
        max_length=30, choices=StatutSouscription.choices, default=StatutSouscription.BROUILLON
    )

    cotisation = models.ForeignKey(
        "cotisations.Cotisation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="souscription_adhesion",
        help_text=_("Écriture de paiement liée, une fois la souscription payée."),
    )

    snapshot_avantages = models.JSONField(
        default=list,
        blank=True,
        help_text=_(
            "Copie immuable de OffreAdhesion.avantages au moment de la souscription — "
            "l'historique d'un membre ne doit jamais changer rétroactivement si l'offre évolue."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "adhesions_souscriptions"
        verbose_name = _("Souscription")
        verbose_name_plural = _("Souscriptions")
        ordering = ["-date_souscription"]
        constraints = [
            models.UniqueConstraint(
                fields=["membre", "campagne"], name="une_seule_souscription_par_membre_et_campagne"
            )
        ]
        indexes = [
            models.Index(fields=["membre", "campagne"]),
            models.Index(fields=["statut"]),
        ]

    def __str__(self):
        return f"{self.membre} — {self.offre.nom} ({self.get_statut_display()})"

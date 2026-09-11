"""
Modèles — app cotisations.

R1 P0 — Cotisations & Paiements (FDD §3.2, RICEFW F-004/F-015/F-016/W-001/W-002).

Périmètre de ce module (AHM-15) :
  - Cotisation est un registre d'écritures financières « append-only » : une fois créée, elle
    n'est plus modifiée par l'API (pas de PUT/PATCH/DELETE exposés — voir views.py), à une
    exception volontaire près : l'action `marquer_payee` (AHM-53) permet au Directeur
    Financier/Admin de confirmer manuellement un paiement reçu hors ligne (virement SEPA,
    chèque, espèces) pour une cotisation restée en_attente/echouee — il n'y a toujours pas de
    passerelle de paiement réelle (AHM-46) pour déclencher cette confirmation automatiquement.
    Le stepper de paiement (mockup #pg-cotisation, RICEFW F-004) simule les étapes 1 (article) et
    2 (mode de paiement) uniquement côté client ; l'étape 3 (confirmation) envoie un unique POST
    qui enregistre directement le paiement effectué (W-002 : "POST /cotisations/ avec
    statut=paye").
  - Le montant final n'est jamais fait confiance au frontend (CLAUDE.md §8) : pour les types
    d'article au tarif fixe de l'association (cotisation annuelle, frais d'adhésion), le serializer
    recalcule le montant et le libellé côté serveur — voir MONTANTS_CATALOGUE ci-dessous.
  - `saisie_par` distingue une écriture en libre-service (le membre paie sa propre cotisation,
    `saisie_par` vide) d'une transaction ajoutée manuellement par le Directeur Financier/Admin
    pour le compte d'un autre membre (RICEFW F-015 "Ajouter une transaction (DG)").
"""

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class TypeArticle(models.TextChoices):
    """Article payé — FDD §3.2 étape 1 "Sélection" du stepper."""

    COTISATION = "cotisation", _("Cotisation annuelle")
    ADHESION = "adhesion", _("Frais d'adhésion")
    EVENEMENT = "evenement", _("Événement")
    DON = "don", _("Don libre")


class ModePaiement(models.TextChoices):
    """Mode de paiement — FDD §3.2 étape 2, mockup #pg-cotisation (pm-opt)."""

    CARTE = "carte", _("Carte bancaire")
    VIREMENT_SEPA = "virement_sepa", _("Virement SEPA")
    PAYPAL = "paypal", _("PayPal")


class StatutCotisation(models.TextChoices):
    EN_ATTENTE = "en_attente", _("En attente")
    PAYEE = "payee", _("Payée")
    ECHOUEE = "echouee", _("Échouée")
    REMBOURSEE = "remboursee", _("Remboursée")
    ANNULEE = "annulee", _("Annulée")


# Tarifs fixes de l'association (FDD §3.2) — le serializer les impose côté serveur pour ces deux
# types d'article ; "evenement" (pas encore de modèle Evenement pour porter un prix — à revisiter
# en Phase 2A) et "don" (montant libre par définition) restent au montant transmis par le client.
MONTANTS_CATALOGUE = {
    TypeArticle.COTISATION: Decimal("45.00"),
    TypeArticle.ADHESION: Decimal("15.00"),
}


class Cotisation(models.Model):
    """Écriture de paiement — voir mockup #pg-cotisation (stepper + historique des paiements)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    membre = models.ForeignKey(
        "membres.Membre",
        on_delete=models.PROTECT,
        related_name="cotisations",
    )

    type_article = models.CharField(max_length=20, choices=TypeArticle.choices)
    libelle = models.CharField(max_length=200)
    montant = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    mode_paiement = models.CharField(max_length=20, choices=ModePaiement.choices, blank=True)
    statut = models.CharField(
        max_length=20, choices=StatutCotisation.choices, default=StatutCotisation.EN_ATTENTE
    )
    reference_transaction = models.CharField(max_length=30, unique=True, blank=True, null=True)

    # Pertinent uniquement pour type_article=cotisation — utilisé par le pipeline de relance
    # (RICEFW W-001 : "Identifier membres actifs sans cotisation N").
    annee = models.PositiveSmallIntegerField(null=True, blank=True)

    saisie_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cotisations_saisies",
        help_text=_(
            "Renseigné uniquement si la transaction a été ajoutée manuellement par le "
            "Directeur Financier/Admin pour le compte d'un autre membre (F-015). Vide en "
            "libre-service."
        ),
    )

    date_paiement = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cotisations"
        verbose_name = _("Cotisation")
        verbose_name_plural = _("Cotisations")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["membre", "type_article", "annee"]),
            models.Index(fields=["statut"]),
        ]

    def __str__(self):
        return f"{self.libelle} — {self.membre} ({self.get_statut_display()})"

    def save(self, *args, **kwargs):
        if self.statut == StatutCotisation.PAYEE and not self.reference_transaction:
            if not self.date_paiement:
                self.date_paiement = timezone.now()
            self.reference_transaction = self._generate_reference_transaction()
        super().save(*args, **kwargs)

    def _generate_reference_transaction(self) -> str:
        """
        Format TXN-<année>-<8 hex majuscules>, ex. TXN-2026-A1B2C3D4 (voir génération
        équivalente côté mockup JS, fonction goPayStep). Un suffixe aléatoire (plutôt qu'un
        compteur séquentiel comme Membre.numero_membre) évite tout verrou de concurrence pour
        un identifiant qui n'a pas besoin d'être strictement croissant — la contrainte unique
        sur reference_transaction reste le filet de sécurité en cas de collision (négligeable
        sur 8 caractères hexadécimaux).
        """
        annee = (self.date_paiement or timezone.now()).year
        suffixe = uuid.uuid4().hex[:8].upper()
        return f"TXN-{annee}-{suffixe}"

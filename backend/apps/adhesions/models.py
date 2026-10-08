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
  - JustificatifRabais (upload MinIO, validation RH, URLs pré-signées — AHM-20) complète le
    cycle "rabais avec justificatif" amorcé par Souscription.statut = en_attente_justificatif :
    un membre uploade un document, un rôle RH+ l'approuve ou le rejette, ce qui fait avancer la
    souscription vers en_attente_paiement ou rabais_refuse (FDD §4.2).
  - La génération de reçu PDF, les tâches Celery Beat de relance/clôture automatique, les
    endpoints stats/export et les emails de notification restent différés à des tickets
    ultérieurs (mêmes principes que la scission cotisations AHM-15 → AHM-17/AHM-18).
"""

import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from .storage import JustificatifsStorage, OffreIconeStorage


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
    # Demande utilisateur du 2026-10-06 (point 3) : passé cette date, un membre actif de la
    # campagne PRÉCÉDENTE sans adhésion payée dans celle-ci repasse automatiquement non-membre
    # (tasks.basculer_membres_non_renouveles, historique conservé via HistoriqueStatutMembre).
    date_limite_renouvellement = models.DateField(
        null=True,
        blank=True,
        help_text=_("Frist für Bestandsmitglieder. Vide = aucune bascule automatique."),
    )
    bascule_non_renouveles_le = models.DateTimeField(null=True, blank=True, editable=False)
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


def offre_icone_upload_path(instance, filename):
    return f"adhesions/offres/{instance.id}/icone_{filename}"


class CouleurOffre(models.TextChoices):
    """Palette catégorielle fixe (retour utilisateur du 2026-09-29, "Färblich highlighten") —
    volontairement les 3 MÊMES 3 slots validés déjà utilisés côté frontend (ACCENTS_OFFRE,
    tokens Tailwind cat-1/cat-2/cat-3, voir MonAdhesionPage.tsx et index.css) plutôt qu'un
    sélecteur de couleur libre : évite une combinaison non testée en accessibilité (contraste/
    daltonisme, voir le skill dataviz — "assigner les teintes catégorielles dans un ordre fixe,
    jamais généré"). Vide (choix par défaut) = pas de préférence explicite, le frontend retombe
    alors sur l'attribution automatique par position (comportement inchangé pour les offres
    existantes, voir accentOffre() côté frontend)."""

    CAT_1 = "cat_1", _("Couleur 1")
    CAT_2 = "cat_2", _("Couleur 2")
    CAT_3 = "cat_3", _("Couleur 3")


class KartenStil(models.TextChoices):
    """Look der digitalen Mitgliedskarte eines Angebots (2026-10-06, „Meine Mitgliedschaft“).
    Feste Auswahl statt freier Farbe : jeder Stil ist als Verlauf mit lesbarem Text gestaltet.
    Leer = Standard (CID-Rot, „Rubin“)."""

    WEISS = "weiss", _("Weiß")
    SILBER = "silber", _("Silber")
    GOLD = "gold", _("Gold")
    DIAMANT = "diamant", _("Diamant")
    BRONZE = "bronze", _("Bronze")
    ONYX = "onyx", _("Onyx")
    RUBIN = "rubin", _("Rubin (CID-Rot)")


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

    # Retour utilisateur du 2026-09-29, module "Verwaltung der Mitgliedschaftskampagnen" (voir
    # docstring de tête et CouleurOffre ci-dessus pour le détail de chaque champ) :
    icone = models.ImageField(
        upload_to=offre_icone_upload_path,
        storage=OffreIconeStorage(),
        null=True,
        blank=True,
        help_text=_("Icône affichée sur la kachel de cette offre (mycid.org/membership)."),
    )
    couleur = models.CharField(
        max_length=10,
        choices=CouleurOffre.choices,
        blank=True,
        help_text=_("Surlignage de couleur de la kachel. Vide = attribution automatique."),
    )
    kartenstil = models.CharField(
        max_length=10,
        choices=KartenStil.choices,
        blank=True,
        help_text=_("Look de la carte de membre numérique pour ce niveau. Vide = Rubin."),
    )
    populaire = models.BooleanField(
        default=False,
        help_text=_(
            'Affiche le badge "Beliebt" (Populaire) sur cette offre. Si aucune offre d\'une '
            "campagne n'est marquée, le badge reste placé automatiquement sur l'offre du "
            "milieu (comportement historique, voir accentOffre()/populaire côté frontend)."
        ),
    )

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
                condition=(
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


class StatutJustificatif(models.TextChoices):
    """FDD §4.2 : Justificatif en attente / Approuvé / Rejeté (motif obligatoire)."""

    EN_ATTENTE = "en_attente", _("En attente")
    APPROUVE = "approuve", _("Approuvé")
    REJETE = "rejete", _("Rejeté")


def justificatif_upload_path(instance, filename):
    """
    `filename` n'est PAS le nom fourni par le client : JustificatifRabaisUploadSerializer.
    validate_fichier le réécrit déjà en `<uuid>.<extension détectée côté serveur>` avant
    l'appel à .save() (SCD §7.4 — ne jamais faire confiance à un nom/une extension fournis
    par le client). Ici on ne fait que préfixer par la souscription pour grouper les
    fichiers d'un même dossier dans le bucket.
    """
    return f"{instance.souscription_id}/{filename}"


class JustificatifRabais(models.Model):
    """
    Document justifiant l'éligibilité à un rabais (ex. carte étudiante) — FDD §6.1/§9, AHM-20.

    OneToOneField (et non ForeignKey comme suggéré par le TDD) : le parcours métier documenté
    (FDD §4.2) ne prévoit pas de nouvelle tentative après une décision RH (le membre paie plein
    tarif ou annule) — un seul justificatif actif par souscription simplifie la file RH et
    évite l'ambiguïté "lequel fait foi ?". Un ré-upload avant décision RH remplace le fichier
    sur ce même enregistrement (voir JustificatifRabaisViewSet.create). Si le rabais choisi
    change en cours de souscription, l'ancien justificatif est supprimé (voir
    views.SouscriptionViewSet.souscrire) pour ne jamais laisser une décision RH s'appliquer à
    un rabais différent de celui réellement demandé.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    souscription = models.OneToOneField(
        Souscription, on_delete=models.CASCADE, related_name="justificatif"
    )
    fichier = models.FileField(upload_to=justificatif_upload_path, storage=JustificatifsStorage())
    type_justificatif = models.CharField(max_length=100, blank=True)
    statut = models.CharField(
        max_length=20, choices=StatutJustificatif.choices, default=StatutJustificatif.EN_ATTENTE
    )

    valide_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="justificatifs_valides",
        help_text=_("Membre du rôle RH+ ayant approuvé ou rejeté ce justificatif."),
    )
    date_decision = models.DateTimeField(null=True, blank=True)
    motif_rejet = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "adhesions_justificatifs"
        verbose_name = _("Justificatif de rabais")
        verbose_name_plural = _("Justificatifs de rabais")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["statut"])]

    def __str__(self):
        return f"Justificatif {self.souscription} — {self.get_statut_display()}"

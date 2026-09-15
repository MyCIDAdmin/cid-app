"""
Modèles — app boutique.

R1 P1 — Catalogue avec variantes, commandes à 7 statuts, stock atomique (FDD §3.4,
RICEFW mockup #pg-boutique/#pg-admin-boutique).

Périmètre de ce module (Phase 2A, CLAUDE.md §7 — modèles + API uniquement) :
  - Produit / VarianteProduit forment le catalogue administré par le Bureau Admin+
    (FDD §2.2) : le prix est porté par Produit (jamais par variante — le mockup affiche
    un prix unique par fiche produit), le stock est porté par VarianteProduit (FDD §3.4
    "stock par variante") ; un produit sans déclinaison réelle (taille/couleur) porte
    tout de même une variante unique pour que le stock ait toujours un point d'ancrage.
  - Commande / LigneCommande : le prix final est toujours recalculé côté serveur à la
    création (CLAUDE.md §8 — jamais fait confiance au frontend) et gelé sur la ligne
    (prix_unitaire) pour que l'historique de commande reste exact même si le prix
    catalogue évolue ensuite (même principe que Souscription.snapshot_avantages en
    adhésions). Le stock est décrémenté atomiquement (SELECT FOR UPDATE) à la création
    d'une commande pour éviter toute survente en cas de requêtes concurrentes (FDD §3.4).
  - Génération de facture/reçu PDF, emails de suivi de statut, tâches Celery, KPIs ventes
    et pages React restent hors périmètre de ce ticket (Phase 2B, voir CLAUDE.md §7).

Workflow paiement/expédition/retours (demande utilisateur du 2026-09-15) : Commande porte
désormais `mode_paiement`/`date_paiement_confirme`/`paiement_confirme_par` (confirmation
manuelle du règlement — voir CommandeViewSet.confirmer_paiement, même principe déclaratif que
Cotisation.marquer_payee/AHM-53 ; AUCUN gateway de paiement réel ici, prévu séparément par
AHM-27) et `numero_suivi`/`transporteur`/`date_expedition` (voir CommandeViewSet.expedier). Le
modèle Retour journalise les retours (partiels, par ligne de commande) avec réintégration
automatique du stock — voir CommandeViewSet et le nouveau RetourViewSet.
"""

import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from .storage import ProduitsStorage


class CategorieProduit(models.TextChoices):
    """Mockup #m-newprod — liste déroulante "Catégorie"."""

    VETEMENTS = "vetements", _("Vêtements")
    ACCESSOIRES = "accessoires", _("Accessoires")
    ARTICLES_CLUB = "articles_club", _("Articles club")
    CARTES_DOCS = "cartes_docs", _("Cartes & Docs")
    DIVERS = "divers", _("Divers")


class StatutProduit(models.TextChoices):
    """Mockup #m-edit-prod — "Statut" : Brouillon / Publié / Archivé."""

    BROUILLON = "brouillon", _("Brouillon")
    PUBLIE = "publie", _("Publié")
    ARCHIVE = "archive", _("Archivé")


def produit_image_upload_path(instance, filename):
    return f"{instance.id}/{filename}"


class Produit(models.Model):
    """Produit du catalogue boutique — FDD §3.4. Le prix est porté ici (unique par
    fiche produit, voir mockup) ; le stock est porté par les VarianteProduit liées."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    nom = models.CharField(max_length=200)
    categorie = models.CharField(max_length=20, choices=CategorieProduit.choices)
    description = models.TextField(blank=True)
    prix = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    image = models.ImageField(
        upload_to=produit_image_upload_path, storage=ProduitsStorage(), null=True, blank=True
    )

    statut = models.CharField(
        max_length=20, choices=StatutProduit.choices, default=StatutProduit.BROUILLON
    )
    nouveaute = models.BooleanField(
        default=False, help_text=_('Affiche le badge "Nouveauté" dans le catalogue.')
    )
    seuil_alerte_stock = models.PositiveIntegerField(
        default=5, help_text=_("Alerte admin quand le stock total d'une variante passe en dessous.")
    )
    pourcentage_reduction = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(90)],
        help_text=_("Rabais optionnel (1 à 90 %) appliqué au prix catalogue — voir prix_final."),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "boutique_produits"
        verbose_name = _("Produit")
        verbose_name_plural = _("Produits")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["statut", "categorie"]),
        ]

    def __str__(self):
        return self.nom

    @property
    def stock_total(self) -> int:
        total = self.variantes.aggregate(total=models.Sum("stock"))["total"]
        return total or 0

    @property
    def stock_faible(self) -> bool:
        return 0 < self.stock_total < self.seuil_alerte_stock

    @property
    def en_rupture(self) -> bool:
        return self.stock_total <= 0

    @property
    def prix_final(self) -> Decimal:
        """Prix effectivement facturé — applique `pourcentage_reduction` s'il est défini
        (CLAUDE.md §8 : c'est CETTE valeur, jamais `prix` seul, qui doit être recalculée
        côté serveur et gelée sur LigneCommande.prix_unitaire — voir CommandeViewSet.passer)."""
        if not self.pourcentage_reduction:
            return self.prix
        facteur = Decimal(100 - self.pourcentage_reduction) / Decimal(100)
        return (self.prix * facteur).quantize(Decimal("0.01"))


class VarianteProduit(models.Model):
    """Déclinaison (taille/couleur) d'un produit, porteuse du stock — FDD §3.4."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name="variantes")
    taille = models.CharField(max_length=20, blank=True)
    couleur = models.CharField(max_length=50, blank=True)
    stock = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "boutique_variantes"
        verbose_name = _("Variante produit")
        verbose_name_plural = _("Variantes produit")
        ordering = ["produit", "taille", "couleur"]
        constraints = [
            models.UniqueConstraint(
                fields=["produit", "taille", "couleur"], name="une_seule_variante_par_combinaison"
            )
        ]

    def __str__(self):
        details = " / ".join(filter(None, [self.taille, self.couleur])) or "Unique"
        return f"{self.produit.nom} — {details}"


class StatutCommande(models.TextChoices):
    """Machine à états d'une commande (7 statuts) — FDD §3.4."""

    EN_ATTENTE = "en_attente", _("En attente")
    CONFIRMEE = "confirmee", _("Confirmée")
    EN_PREPARATION = "en_preparation", _("En préparation")
    EXPEDIEE = "expediee", _("Expédiée")
    LIVREE = "livree", _("Livrée")
    ANNULEE = "annulee", _("Annulée")
    REMBOURSEE = "remboursee", _("Remboursée")


class ModePaiementCommande(models.TextChoices):
    """Mode de paiement déclaré pour une commande — même principe déclaratif que
    apps.cotisations.ModePaiement (AUCUN gateway réel branché ici, voir AHM-27) : la valeur
    reflète ce que le membre a choisi/le CID a reçu, la confirmation reste toujours manuelle
    (voir CommandeViewSet.confirmer_paiement)."""

    EN_LIGNE = "en_ligne", _("Paiement en ligne")
    VIREMENT = "virement", _("Virement SEPA")
    ESPECES = "especes", _("Espèces")


class MotifRetour(models.TextChoices):
    """Motif d'une retoure (mockup non fourni pour cet écran — catégories usuelles e-commerce,
    voir Retour)."""

    DEFECTUEUX = "defectueux", _("Article défectueux/abîmé")
    MAUVAISE_TAILLE = "mauvaise_taille", _("Mauvaise taille")
    NE_CONVIENT_PAS = "ne_convient_pas", _("Ne convient pas")
    ERREUR_ENVOI = "erreur_envoi", _("Erreur d'envoi")
    AUTRE = "autre", _("Autre")


# Statuts depuis lesquels une commande peut encore être annulée (par le membre ou un
# rôle de gestion) avec restitution du stock — au-delà (expédiée/livrée), le processus
# adapté est une Retoure (voir CommandeViewSet/RetourViewSet), pas une annulation.
STATUTS_ANNULABLES = {StatutCommande.EN_ATTENTE, StatutCommande.CONFIRMEE}

# Statuts depuis lesquels une retoure peut être enregistrée — seule une commande déjà
# physiquement expédiée peut faire l'objet d'un retour ; avant cela, `annuler` est le bon outil.
STATUTS_RETOURNABLES = {StatutCommande.EXPEDIEE, StatutCommande.LIVREE}

# Transitions de statut valides pour l'action de gestion générique `changer_statut`
# (Bureau Admin+). Volontairement strict (pas de retour en arrière hors annulation) pour
# éviter des incohérences (ex. "livrée" -> "en attente").
#
# EN_ATTENTE -> CONFIRMEE et {CONFIRMEE,EN_PREPARATION} -> EXPEDIEE sont volontairement ABSENTS
# de cette machine générique (demande utilisateur du 2026-09-15) : ces deux transitions portent
# des données/contrôles propres (confirmation de paiement, numéro de suivi) et ne passent QUE par
# les actions dédiées confirmer_paiement/expedier ci-dessous (CommandeViewSet) — sinon
# `changer_statut` permettrait de contourner le contrôle "paiement reçu avant expédition" au
# cœur de la demande.
TRANSITIONS_STATUT_COMMANDE = {
    StatutCommande.EN_ATTENTE: {StatutCommande.ANNULEE},
    StatutCommande.CONFIRMEE: {StatutCommande.EN_PREPARATION, StatutCommande.ANNULEE},
    StatutCommande.EN_PREPARATION: {StatutCommande.ANNULEE},
    StatutCommande.EXPEDIEE: {StatutCommande.LIVREE, StatutCommande.REMBOURSEE},
    StatutCommande.LIVREE: {StatutCommande.REMBOURSEE},
    StatutCommande.ANNULEE: set(),
    StatutCommande.REMBOURSEE: set(),
}

# Statuts depuis lesquels confirmer_paiement (EN_ATTENTE -> CONFIRMEE) est autorisé — un seul
# statut de départ ici (pas d'équivalent "échouée" côté boutique, contrairement à Cotisation).
STATUTS_CONFIRMABLES_PAIEMENT = {StatutCommande.EN_ATTENTE}

# Statuts depuis lesquels expedier (-> EXPEDIEE) est autorisé en flux normal, càd une fois le
# paiement déjà confirmé — voir STATUTS_EXPEDIABLES_NACERFASSEMENT pour le cas dérogatoire.
STATUTS_EXPEDIABLES_NORMAL = {StatutCommande.CONFIRMEE, StatutCommande.EN_PREPARATION}

# "Nacherfassung" (demande utilisateur du 2026-09-15) : statuts depuis lesquels expedier() peut
# sauter directement à EXPEDIEE, paiement compris, pour une commande gérée hors système (avant
# l'introduction de cette fonctionnalité, ou par téléphone) — voir CommandeViewSet.expedier.
STATUTS_EXPEDIABLES_NACERFASSEMENT = STATUTS_EXPEDIABLES_NORMAL | {StatutCommande.EN_ATTENTE}


class Commande(models.Model):
    """
    Commande boutique — FDD §3.4. Le montant total est systématiquement recalculé côté
    serveur (CLAUDE.md §8) à partir des lignes ; le numéro de commande est un identifiant
    non prédictible (UUID v4 + suffixe aléatoire, jamais séquentiel — FDD §3.4/§10.2).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    numero_commande = models.CharField(max_length=30, unique=True, editable=False)
    membre = models.ForeignKey("membres.Membre", on_delete=models.PROTECT, related_name="commandes")

    # --- Livraison (étape 2 du stepper, FDD §3.4) ---
    nom_destinataire = models.CharField(max_length=200)
    adresse_livraison = models.CharField(max_length=255)
    code_postal_livraison = models.CharField(max_length=10)
    ville_livraison = models.CharField(max_length=100)
    pays_livraison = models.CharField(max_length=100, default="Allemagne")
    telephone_livraison = models.CharField(max_length=30, blank=True)

    montant_total = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Recalculé côté serveur = somme des lignes (CLAUDE.md §8)."),
    )
    statut = models.CharField(
        max_length=20, choices=StatutCommande.choices, default=StatutCommande.EN_ATTENTE
    )

    # --- Paiement (confirmation manuelle, voir CommandeViewSet.confirmer_paiement) ---
    mode_paiement = models.CharField(
        max_length=20, choices=ModePaiementCommande.choices, blank=True
    )
    date_paiement_confirme = models.DateTimeField(null=True, blank=True)
    paiement_confirme_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commandes_paiement_confirme",
        help_text=_("Directeur Financier/Admin ayant confirmé la réception du paiement."),
    )

    # --- Expédition (voir CommandeViewSet.expedier) ---
    numero_suivi = models.CharField(max_length=100, blank=True)
    transporteur = models.CharField(max_length=100, blank=True)
    date_expedition = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_(
            "Date réelle d'expédition — normalement la date de l'action, mais éditable pour une "
            "saisie rétroactive (nacherfassement)."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "boutique_commandes"
        verbose_name = _("Commande")
        verbose_name_plural = _("Commandes")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["membre", "statut"]),
            models.Index(fields=["statut"]),
        ]

    def __str__(self):
        return f"{self.numero_commande} — {self.membre}"

    def save(self, *args, **kwargs):
        if not self.numero_commande:
            self.numero_commande = self._generate_numero_commande()
        super().save(*args, **kwargs)

    def _generate_numero_commande(self) -> str:
        """Format CMD-<8 hex majuscules>, ex. CMD-A1B2C3D4 — non prédictible (FDD §3.4),
        même principe que Cotisation._generate_reference_transaction."""
        for _essai in range(5):
            candidat = f"CMD-{uuid.uuid4().hex[:8].upper()}"
            if not Commande.objects.filter(numero_commande=candidat).exists():
                return candidat
        # Filet de sécurité en cas de collision improbable répétée — voir Cotisation.
        return f"CMD-{uuid.uuid4().hex[:12].upper()}"


class LigneCommande(models.Model):
    """
    Ligne de commande — le prix unitaire est gelé au moment de la commande
    (snapshot immuable, même principe que Souscription.snapshot_avantages) : il ne
    doit jamais changer rétroactivement si le prix catalogue évolue ensuite.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    commande = models.ForeignKey(Commande, on_delete=models.CASCADE, related_name="lignes")
    variante = models.ForeignKey(
        VarianteProduit, on_delete=models.PROTECT, related_name="lignes_commande"
    )

    quantite = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    prix_unitaire = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )

    class Meta:
        db_table = "boutique_lignes_commande"
        verbose_name = _("Ligne de commande")
        verbose_name_plural = _("Lignes de commande")

    def __str__(self):
        return f"{self.variante} × {self.quantite}"

    @property
    def sous_total(self) -> Decimal:
        return (self.prix_unitaire * self.quantite).quantize(Decimal("0.01"))

    @property
    def quantite_retournee(self) -> int:
        total = self.retours.aggregate(total=models.Sum("quantite"))["total"]
        return total or 0

    @property
    def quantite_retournable(self) -> int:
        return max(0, self.quantite - self.quantite_retournee)


class Retour(models.Model):
    """
    Retoure (demande utilisateur du 2026-09-15) — journal des retours, partiels ou complets,
    ligne par ligne : `quantite` ne peut jamais dépasser LigneCommande.quantite_retournable (voir
    RetourViewSet.create). L'enregistrement d'une retoure réintègre atomiquement la quantité
    retournée dans VarianteProduit.stock (même verrouillage SELECT FOR UPDATE que
    `_restituer_stock`) ; elle ne modifie PAS `Commande.statut` (une commande partiellement
    retournée n'a pas d'état propre dans StatutCommande — un remboursement/changement de statut
    reste un geste manuel séparé, via `changer_statut` vers REMBOURSEE si besoin).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    commande = models.ForeignKey(Commande, on_delete=models.PROTECT, related_name="retours")
    ligne_commande = models.ForeignKey(
        LigneCommande, on_delete=models.PROTECT, related_name="retours"
    )
    quantite = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    motif = models.CharField(max_length=20, choices=MotifRetour.choices)
    commentaire = models.TextField(blank=True)

    enregistre_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="retours_enregistres",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "boutique_retours"
        verbose_name = _("Retoure")
        verbose_name_plural = _("Retoures")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["commande"])]

    def __str__(self):
        return f"Retoure {self.quantite} × {self.ligne_commande.variante} ({self.commande.numero_commande})"

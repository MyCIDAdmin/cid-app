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
"""

import uuid
from decimal import Decimal

from django.core.validators import MinValueValidator
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


# Statuts depuis lesquels une commande peut encore être annulée (par le membre ou un
# rôle de gestion) avec restitution du stock — au-delà (expédiée/livrée), une annulation
# relèverait d'un processus de retour non modélisé dans ce ticket (voir docstring module).
STATUTS_ANNULABLES = {StatutCommande.EN_ATTENTE, StatutCommande.CONFIRMEE}

# Transitions de statut valides pour l'action de gestion `changer_statut` (Bureau Admin+).
# Volontairement strict (pas de retour en arrière hors annulation) pour éviter des
# incohérences (ex. "livrée" -> "en attente").
TRANSITIONS_STATUT_COMMANDE = {
    StatutCommande.EN_ATTENTE: {StatutCommande.CONFIRMEE, StatutCommande.ANNULEE},
    StatutCommande.CONFIRMEE: {StatutCommande.EN_PREPARATION, StatutCommande.ANNULEE},
    StatutCommande.EN_PREPARATION: {StatutCommande.EXPEDIEE, StatutCommande.ANNULEE},
    StatutCommande.EXPEDIEE: {StatutCommande.LIVREE, StatutCommande.REMBOURSEE},
    StatutCommande.LIVREE: {StatutCommande.REMBOURSEE},
    StatutCommande.ANNULEE: set(),
    StatutCommande.REMBOURSEE: set(),
}


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

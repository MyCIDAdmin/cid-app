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

Offres personnalisées et bons d'achat (demande utilisateur du 2026-09-23 : "Beim Kauf von über
10 Artikeln... 10% Rabatt", "Beim Kauf von 5 Stück... geschenkten Artikel", "Es soll möglich
sein Gutscheine zu Kaufen") :

  - RegleReduction : système générique de paliers de réduction PAR PRODUIT (choix confirmé par
    l'utilisateur — pas les deux exemples codés en dur, un Bureau Admin+ peut définir librement
    des paliers par article), deux types indépendants (voir TypeReduction) : un pourcentage sur
    la ligne à partir d'un seuil de quantité identique, OU un nombre d'articles offerts (calculé
    par division entière quantité//seuil — voir calculer_reduction_quantite). Les deux types
    peuvent coexister sur un même produit avec des seuils différents ; dans chaque type, seule la
    règle au seuil le plus élevé atteint s'applique (pas de cumul de plusieurs paliers du même
    type). Toujours recalculé côté serveur à `passer`/`vendre_especes` (CLAUDE.md §8), jamais
    fait confiance à un total envoyé par le frontend — voir LigneCommande.reduction_quantite.
  - BonAchat : bon d'achat/Gutschein à montant libre (5 à 500 €, choix confirmé par
    l'utilisateur), payé en ligne (Stripe/PayPal, même passerelles que Commande — voir
    apps.boutique.webhooks) ou par virement/espèces confirmé manuellement par le Directeur
    Financier+ (même principe que Commande.confirmer_paiement). Porte un `solde` distinct de
    `montant_initial` (choix confirmé par l'utilisateur : réutilisable partiellement sur
    plusieurs commandes, comme un compte prépayé) décrémenté atomiquement à l'application d'un
    code au checkout (voir CommandeViewSet.passer/UtilisationBonAchat, même verrouillage
    SELECT FOR UPDATE que le stock). Le code n'est utilisable (`utilisable`) qu'une fois le
    paiement confirmé (statut ACTIF) et avant sa date d'expiration (3 ans après activation,
    pratique standard des CGV allemandes pour les Gutscheine).
  - Commande.bon_achat/montant_bon_achat : trace le bon appliqué à une commande donnée ;
    Commande.montant_du (montant_total - montant_bon_achat) est ce qui reste effectivement à
    régler — c'est cette valeur, jamais montant_total seul, qui doit être transmise à la
    passerelle de paiement en ligne (voir CommandeViewSet.initier_paiement_en_ligne). Une
    commande entièrement couverte par un bon d'achat (montant_du <= 0) est confirmée
    immédiatement (mode_paiement=BON_ACHAT), sans étape de paiement supplémentaire.

Achat d'un bon d'achat intégré au catalogue (demande utilisateur du 2026-09-23, révisée le même
jour : "Gutschein soll als Kategorie im shop auftauchen und nicht als eigenes Modul" / "Gutschein
wird ein echtes Produkt im Katalog") : un bon d'achat n'est PLUS acheté via un point d'entrée
dédié (BonAchatViewSet.acheter, supprimé) mais comme n'importe quel autre article — un Produit
avec `type_produit=BON_ACHAT` (voir TypeProduit) et `categorie=BON_ACHAT`, ajouté au panier et
payé via le flux normal `CommandeViewSet.passer`/`vendre_especes`. Deux différences de traitement
pour une ligne portant sur un tel produit (voir `_construire_ligne_avec_reduction`/views.py) :
  - le prix n'est pas `produit.prix_final` mais un montant choisi par l'acheteur, transmis par le
    frontend (LigneCommandeEntreeSerializer.montant) et TOUJOURS revalidé côté serveur contre
    `bon_achat_montant_min()`/`bon_achat_montant_max()` (CLAUDE.md §8, jamais fait confiance au
    frontend) ;
  - aucune réduction quantité (RegleReduction) ni décrément/vérification de stock ne s'applique —
    un bon d'achat n'a pas de notion de stock épuisable (voir Produit.en_rupture/stock_faible,
    toujours `False` pour ce type) ; `LigneCommande.variante` reste néanmoins renseignée (FK
    obligatoire) via une VarianteProduit "sentinelle" unique auto-créée par `Produit.save()` pour
    ancrer la ligne, jamais utilisée pour son stock.
Au moment où la Commande passe à CONFIRMEE — quel que soit le chemin (couverture totale par un
bon d'achat existant dans `passer`, `vendre_especes`, `confirmer_paiement` manuel, ou webhook PSP
via `_confirmer_paiement_gateway`) — `_generer_bons_achat(commande)` (voir views.py) crée pour
chaque ligne bon_achat de la commande `quantite` BonAchat déjà ACTIF (plus d'étape EN_ATTENTE
intermédiaire, voir StatutBonAchat) et déclenche l'email/notification existants
(`notifier_bon_achat_actif`) — même pipeline HTML que précédemment, seul le déclencheur change.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.membres.models import StatutMembre

from .storage import ProduitsStorage

# Durée de validité d'un bon d'achat à compter de son activation (paiement confirmé) — 3 ans,
# pratique standard des CGV allemandes pour les Gutscheine (voir docstring module).
DUREE_VALIDITE_BON_ACHAT = timedelta(days=365 * 3)


class CategorieProduit(models.TextChoices):
    """Mockup #m-newprod — liste déroulante "Catégorie". BON_ACHAT ajoutée le 2026-09-23 (voir
    docstring de tête du module) : un produit de cette catégorie porte toujours
    `type_produit=TypeProduit.BON_ACHAT`, mais les deux champs restent distincts (catégorie =
    rangement/filtre catalogue, type_produit = comportement métier) au cas où un jour un bon
    d'achat mériterait sa propre sous-catégorie sans changer son comportement."""

    VETEMENTS = "vetements", _("Vêtements")
    ACCESSOIRES = "accessoires", _("Accessoires")
    ARTICLES_CLUB = "articles_club", _("Articles club")
    CARTES_DOCS = "cartes_docs", _("Cartes & Docs")
    DIVERS = "divers", _("Divers")
    BON_ACHAT = "bon_achat", _("Bons d'achat")


class TypeProduit(models.TextChoices):
    """Distingue un produit physique (stock/variantes réelles) d'un bon d'achat à montant libre
    (demande utilisateur du 2026-09-23, voir docstring de tête du module) — pilote le
    comportement de `_construire_ligne_avec_reduction`/`passer`/`vendre_especes` (montant choisi
    par l'acheteur au lieu de prix_final, pas de réduction quantité, pas de stock)."""

    PHYSIQUE = "physique", _("Produit physique")
    BON_ACHAT = "bon_achat", _("Bon d'achat")


# Stock "sentinelle" de la VarianteProduit unique auto-créée pour un produit bon_achat (voir
# Produit.save()) — jamais lu pour une décision de stock réel (en_rupture/stock_faible sont
# toujours False pour ce type, et passer/vendre_especes sautent la vérification/décrément de
# stock pour ces lignes), une valeur élevée est purement défensive si un code non mis à jour
# venait malgré tout à la consulter.
STOCK_SENTINELLE_BON_ACHAT = 999_999


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
    type_produit = models.CharField(
        max_length=20,
        choices=TypeProduit.choices,
        default=TypeProduit.PHYSIQUE,
        help_text=_(
            "Physique (stock réel) ou bon d'achat (montant choisi par l'acheteur, sans stock) — "
            "voir docstring de tête du module."
        ),
    )
    description = models.TextField(blank=True)
    prix = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_(
            "Pour un bon d'achat (type_produit=BON_ACHAT), ce prix catalogue n'est qu'indicatif "
            "(« à partir de ») — le montant réellement facturé est choisi par l'acheteur au "
            "moment de l'ajout au panier, borné à [bon_achat_montant_min, bon_achat_montant_max] "
            "et toujours revalidé côté serveur, jamais ce champ."
        ),
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
    prix_membre = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_(
            "Prix optionnel réservé aux membres actifs (demande utilisateur, mycid.org/shop — "
            "badge « Mitglieder Preis »). Quand il est défini, un membre CONNECTÉ et ACTIF "
            "(StatutMembre.ACTIF) voit et paie CE prix au lieu de prix_final ; tout autre "
            "acheteur (non connecté, non-membre, membre en_attente/inactif) continue de payer "
            "prix_final, sans lien avec ce champ. Ne se cumule jamais avec pourcentage_reduction "
            "— voir prix_pour_membre(), seul point qui résout laquelle des deux remises "
            "s'applique, toujours recalculé côté serveur (CLAUDE.md §8, même choke point que "
            "prix_final : CommandeViewSet._construire_ligne_avec_reduction)."
        ),
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

    def save(self, *args, **kwargs):
        """Un bon d'achat n'a pas de déclinaison réelle mais LigneCommande.variante reste une FK
        obligatoire (voir docstring de tête du module) : on lui garantit ici une unique
        VarianteProduit "sentinelle" (taille/couleur vides, jamais utilisée pour son stock),
        même principe que `stock_initial` côté ProduitSerializer mais automatique et systématique
        pour ce type — un Bureau Admin+ n'a jamais à y penser en créant un produit bon_achat."""
        creation = self._state.adding
        super().save(*args, **kwargs)
        if self.type_produit == TypeProduit.BON_ACHAT and (creation or not self.variantes.exists()):
            VarianteProduit.objects.get_or_create(
                produit=self,
                taille="",
                couleur="",
                defaults={"stock": STOCK_SENTINELLE_BON_ACHAT},
            )

    @property
    def stock_total(self) -> int:
        total = self.variantes.aggregate(total=models.Sum("stock"))["total"]
        return total or 0

    @property
    def stock_faible(self) -> bool:
        if self.type_produit == TypeProduit.BON_ACHAT:
            return False
        return 0 < self.stock_total < self.seuil_alerte_stock

    @property
    def en_rupture(self) -> bool:
        if self.type_produit == TypeProduit.BON_ACHAT:
            return False
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

    def prix_pour_membre(self, membre) -> tuple[Decimal, bool]:
        """Résout le prix EFFECTIF pour `membre` (instance apps.membres.Membre, ou None pour un
        visiteur/anonyme) — SEUL point qui doit décider entre `prix_membre` et `prix_final`, à
        appeler aussi bien pour l'affichage (ProduitSerializer.get_prix_affiche) que pour le
        montant réellement facturé (CommandeViewSet._construire_ligne_avec_reduction), afin de ne
        jamais dupliquer cette logique entre les deux (CLAUDE.md §8 — la résolution reste
        entièrement côté serveur, `membre` vient toujours de request.user.membre ou d'un membre
        cible explicite côté serveur, jamais d'un indicateur envoyé par le client).

        Retourne (prix, est_prix_membre) : `prix_membre` s'applique uniquement si défini ET que
        `membre` est actif (StatutMembre.ACTIF) — jamais de cumul avec `pourcentage_reduction`,
        contrairement à la réduction par quantité qui continue elle de s'appliquer par-dessus
        (voir _construire_ligne_avec_reduction)."""
        if (
            self.prix_membre is not None
            and membre is not None
            and membre.statut == StatutMembre.ACTIF
        ):
            return self.prix_membre, True
        return self.prix_final, False


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


class TypeReduction(models.TextChoices):
    """Les deux mécaniques indépendantes du système générique de paliers — voir
    RegleReduction/calculer_reduction_quantite."""

    POURCENTAGE = "pourcentage", _("Pourcentage de réduction")
    ARTICLE_OFFERT = "article_offert", _("Article(s) offert(s)")


class RegleReduction(models.Model):
    """Palier de réduction par quantité, propre à un produit — voir docstring de tête du
    module pour la conception générale (demande utilisateur du 2026-09-23). Plusieurs règles
    peuvent coexister sur un même produit (types différents et/ou seuils différents) ;
    `calculer_reduction_quantite` ne retient que la règle au seuil le plus élevé atteint pour
    chaque type."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    produit = models.ForeignKey(Produit, on_delete=models.CASCADE, related_name="regles_reduction")
    seuil_quantite = models.PositiveIntegerField(
        validators=[MinValueValidator(2)],
        help_text=_(
            "Quantité du même produit à atteindre dans la commande pour déclencher la règle."
        ),
    )
    type_reduction = models.CharField(max_length=20, choices=TypeReduction.choices)
    pourcentage = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(1), MaxValueValidator(90)],
        help_text=_("Requis et unique sens pour type_reduction=pourcentage — voir clean()."),
    )
    actif = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "boutique_regles_reduction"
        verbose_name = _("Règle de réduction")
        verbose_name_plural = _("Règles de réduction")
        ordering = ["produit", "seuil_quantite"]
        constraints = [
            models.UniqueConstraint(
                fields=["produit", "seuil_quantite"], name="un_seul_palier_par_seuil_et_produit"
            )
        ]

    def __str__(self):
        if self.type_reduction == TypeReduction.POURCENTAGE:
            detail = f"-{self.pourcentage}%"
        else:
            detail = "article offert"
        return f"{self.produit.nom} — dès {self.seuil_quantite} : {detail}"


@dataclass(frozen=True)
class ReductionQuantite:
    """Résultat de `calculer_reduction_quantite` — quantité d'articles offerts (division
    entière quantite // seuil de la meilleure règle ARTICLE_OFFERT atteinte) et pourcentage de
    la meilleure règle POURCENTAGE atteinte, indépendamment l'un de l'autre (voir docstring de
    module)."""

    quantite_offerte: int = 0
    pourcentage_applique: int | None = None


def calculer_reduction_quantite(produit: Produit, quantite: int) -> ReductionQuantite:
    """Détermine la réduction quantité applicable à une ligne — appelée sous transaction par
    CommandeViewSet.passer/vendre_especes (CLAUDE.md §8 : jamais fait confiance à un montant
    envoyé par le client). `produit.regles_reduction` doit être préchargé par l'appelant
    (prefetch_related) pour éviter le N+1 — voir views.py."""
    regles_actives = [r for r in produit.regles_reduction.all() if r.actif]

    regles_offertes = [
        r
        for r in regles_actives
        if r.type_reduction == TypeReduction.ARTICLE_OFFERT and r.seuil_quantite <= quantite
    ]
    regles_pourcentage = [
        r
        for r in regles_actives
        if r.type_reduction == TypeReduction.POURCENTAGE and r.seuil_quantite <= quantite
    ]

    meilleure_offerte = max(regles_offertes, key=lambda r: r.seuil_quantite, default=None)
    meilleure_pourcentage = max(regles_pourcentage, key=lambda r: r.seuil_quantite, default=None)

    return ReductionQuantite(
        quantite_offerte=quantite // meilleure_offerte.seuil_quantite if meilleure_offerte else 0,
        pourcentage_applique=meilleure_pourcentage.pourcentage if meilleure_pourcentage else None,
    )


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
    BON_ACHAT = "bon_achat", _("Bon d'achat")


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

# Statuts depuis lesquels une retoure peut être enregistrée — "Nacherfassung von Retouren"
# (demande utilisateur du 2026-09-15, précisée le 2026-09-16 après un premier test) : la
# retoure est volontairement INDÉPENDANTE du statut de la commande, symétriquement à
# `expedier(nacherfassement=True)` pour l'expédition — un Bureau Admin+ doit pouvoir
# enregistrer un retour partiel même pour une commande jamais formellement fait passer par
# confirmer_paiement/expedier dans le système (vente/retour gérés en pratique hors flux
# digital). Seuls ANNULEE et REMBOURSEE sont exclus : ces deux statuts ont déjà restitué la
# totalité du stock de la commande via `_restituer_stock`/`changer_statut`, un Retour
# supplémentaire par-dessus créerait un double comptage de stock.
STATUTS_RETOURNABLES = {
    StatutCommande.EN_ATTENTE,
    StatutCommande.CONFIRMEE,
    StatutCommande.EN_PREPARATION,
    StatutCommande.EXPEDIEE,
    StatutCommande.LIVREE,
}

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

    # --- Paiement (confirmation manuelle via CommandeViewSet.confirmer_paiement, OU
    # automatique via webhook PSP — CommandeViewSet.initier_paiement_en_ligne/
    # apps.boutique.webhooks, ajouté le 2026-09-17) ---
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
        help_text=_(
            "Directeur Financier/Admin ayant confirmé la réception du paiement — vide pour "
            "une confirmation automatique par webhook PSP (voir reference_paiement)."
        ),
    )
    reference_paiement = models.CharField(
        max_length=64,
        blank=True,
        help_text=_(
            "Référence externe du paiement (PSP), ex. STRIPE-pi_xxx / PAYPAL-xxx — renseignée "
            "uniquement pour un paiement confirmé automatiquement via webhook (voir "
            "apps.boutique.webhooks), jamais pour une confirmation manuelle."
        ),
    )

    # --- Bon d'achat (demande utilisateur du 2026-09-23, voir docstring de tête du module) ---
    bon_achat = models.ForeignKey(
        "BonAchat",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="commandes",
        help_text=_("Bon d'achat appliqué à cette commande, le cas échéant — voir montant_du."),
    )
    montant_bon_achat = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
        help_text=_("Montant déduit via bon_achat — voir UtilisationBonAchat pour le journal."),
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

    @property
    def montant_du(self) -> Decimal:
        """Ce qu'il reste effectivement à régler après déduction d'un éventuel bon d'achat —
        c'est CETTE valeur (jamais montant_total seul) qui doit être transmise à la passerelle
        de paiement en ligne (voir CommandeViewSet.initier_paiement_en_ligne) : montant_total
        reste le total brut de la commande (somme des lignes nettes de réduction quantité,
        CLAUDE.md §8), montant_bon_achat une déduction séparée et traçable (UtilisationBonAchat)."""
        return max(self.montant_total - self.montant_bon_achat, Decimal("0.00"))


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

    # --- Réduction quantité (demande utilisateur du 2026-09-23), gelée comme prix_unitaire —
    # voir calculer_reduction_quantite/CommandeViewSet.passer. quantite_offerte/
    # pourcentage_reduction_quantite sont purement informatifs pour l'affichage (reçu, admin) ;
    # reduction_quantite (déjà en €, quantite_offerte*prix_unitaire + pourcentage sur le reste)
    # est ce qui a réellement été déduit du sous_total pour obtenir montant_total.
    quantite_offerte = models.PositiveIntegerField(default=0)
    pourcentage_reduction_quantite = models.PositiveSmallIntegerField(null=True, blank=True)
    reduction_quantite = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=[MinValueValidator(Decimal("0.00"))],
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
    def sous_total_net(self) -> Decimal:
        """sous_total après déduction de la réduction quantité — c'est ce montant (jamais
        sous_total seul) qui entre dans Commande.montant_total, voir CommandeViewSet.passer."""
        return self.sous_total - self.reduction_quantite

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
        return (
            f"Retoure {self.quantite} × {self.ligne_commande.variante} "
            f"({self.commande.numero_commande})"
        )


class StatutBonAchat(models.TextChoices):
    """Machine à états d'un bon d'achat — voir docstring de tête du module. Plus de statut
    EN_ATTENTE depuis le 2026-09-23 : un BonAchat n'est désormais créé qu'au moment où la
    Commande qui le contient est CONFIRMEE (voir views._generer_bons_achat), donc toujours déjà
    ACTIF dès sa création — il n'existe plus de bon "en attente de paiement" à modéliser."""

    ACTIF = "actif", _("Actif")
    EPUISE = "epuise", _("Épuisé")


def bon_achat_montant_min() -> Decimal:
    return Decimal("5.00")


def bon_achat_montant_max() -> Decimal:
    return Decimal("500.00")


class BonAchat(models.Model):
    """
    Bon d'achat/Gutschein — voir docstring de tête du module pour la conception d'ensemble
    (demande utilisateur du 2026-09-23, achat intégré au catalogue depuis la révision du même
    jour). `code` est généré à la création, qui n'a lieu qu'au moment où la Commande contenant la
    ligne bon_achat est CONFIRMEE (voir views._generer_bons_achat) — un BonAchat est donc
    toujours déjà ACTIF dès sa création, plus d'état intermédiaire "acheté mais pas encore payé".
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    code = models.CharField(max_length=20, unique=True, editable=False)
    montant_initial = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[
            MinValueValidator(bon_achat_montant_min()),
            MaxValueValidator(bon_achat_montant_max()),
        ],
    )
    solde = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )
    statut = models.CharField(
        max_length=20,
        choices=StatutBonAchat.choices,
        default=StatutBonAchat.ACTIF,
        help_text=_(
            "Toujours ACTIF dès la création depuis le 2026-09-23 — voir "
            "views._generer_bons_achat/activer()."
        ),
    )

    achete_par = models.ForeignKey(
        "membres.Membre", on_delete=models.PROTECT, related_name="bons_achat_achetes"
    )

    # --- Paiement — même principe que les champs homonymes sur Commande (confirmation manuelle
    # OU automatique via webhook PSP, voir apps.boutique.webhooks/CommandeViewSet) ---
    mode_paiement = models.CharField(
        max_length=20, choices=ModePaiementCommande.choices, blank=True
    )
    date_paiement_confirme = models.DateTimeField(null=True, blank=True)
    paiement_confirme_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bons_achat_paiement_confirme",
        help_text=_(
            "Directeur Financier/Admin ayant confirmé un paiement manuel — vide pour un "
            "paiement en ligne confirmé automatiquement par webhook PSP."
        ),
    )
    reference_paiement = models.CharField(max_length=64, blank=True)

    date_expiration = models.DateTimeField(
        null=True,
        blank=True,
        help_text=_(
            "Renseignée à l'activation (statut=ACTIF) = date_paiement_confirme + "
            "DUREE_VALIDITE_BON_ACHAT."
        ),
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "boutique_bons_achat"
        verbose_name = _("Bon d'achat")
        verbose_name_plural = _("Bons d'achat")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["code"]), models.Index(fields=["achete_par", "statut"])]

    def __str__(self):
        return f"{self.code} — {self.solde} € (achete_par={self.achete_par})"

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self._generate_code()
        super().save(*args, **kwargs)

    def _generate_code(self) -> str:
        """Format BON-<8 hex majuscules>, ex. BON-A1B2C3D4 — même principe non prédictible que
        Commande._generate_numero_commande."""
        for _essai in range(5):
            candidat = f"BON-{uuid.uuid4().hex[:8].upper()}"
            if not BonAchat.objects.filter(code=candidat).exists():
                return candidat
        return f"BON-{uuid.uuid4().hex[:12].upper()}"

    @property
    def est_expire(self) -> bool:
        return bool(self.date_expiration) and timezone.now() > self.date_expiration

    @property
    def utilisable(self) -> bool:
        """Un code n'est présenté comme applicable au checkout que s'il est ACTIF (paiement
        confirmé), non expiré, et a encore du solde — voir CommandeViewSet.passer/
        BonAchatViewSet.verifier."""
        return self.statut == StatutBonAchat.ACTIF and self.solde > 0 and not self.est_expire

    def activer(self) -> None:
        """Fixe la date d'expiration et (re)confirme le statut ACTIF — appelée par
        views._generer_bons_achat juste après la création de chaque BonAchat, pour ne jamais
        dupliquer ce calcul entre les quatre chemins de confirmation d'une Commande (paiement en
        ligne immédiat, `vendre_especes`, `confirmer_paiement` manuel, webhook PSP)."""
        maintenant = timezone.now()
        self.date_paiement_confirme = maintenant
        self.date_expiration = maintenant + DUREE_VALIDITE_BON_ACHAT
        self.statut = StatutBonAchat.ACTIF


class UtilisationBonAchat(models.Model):
    """
    Journal d'application d'un bon d'achat à une commande — append-only, même convention que
    Retour : `solde`/`statut` sur BonAchat restent la source de vérité pour l'affichage rapide,
    cette table est la trace auditable de chaque déduction (CLAUDE.md §8, plusieurs commandes
    peuvent puiser dans le même bon tant qu'il reste du solde — voir docstring de tête du
    module).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    bon_achat = models.ForeignKey(BonAchat, on_delete=models.PROTECT, related_name="utilisations")
    commande = models.ForeignKey(
        Commande, on_delete=models.PROTECT, related_name="utilisations_bon_achat"
    )
    montant = models.DecimalField(
        max_digits=8, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "boutique_utilisations_bon_achat"
        verbose_name = _("Utilisation de bon d'achat")
        verbose_name_plural = _("Utilisations de bon d'achat")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["bon_achat"])]

    def __str__(self):
        return f"{self.montant} € de {self.bon_achat.code} sur {self.commande.numero_commande}"

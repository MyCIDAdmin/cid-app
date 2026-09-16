"""
Modèles — app cotisations.

R1 P0 — Cotisations & Paiements (FDD §3.2, RICEFW F-004/F-015/F-016/W-001/W-002).

Périmètre de ce module (AHM-15, révisé par AHM-53) :
  - Cotisation est un registre d'écritures financières « append-only » : une fois créée, elle
    n'est plus modifiée par l'API (pas de PUT/PATCH/DELETE exposés — voir views.py), à une
    exception volontaire près : l'action `marquer_payee` (AHM-53) permet au Directeur
    Financier/Admin de confirmer manuellement un paiement reçu hors ligne (virement SEPA,
    chèque, espèces) pour une cotisation restée en_attente/echouee — il n'y a toujours pas de
    passerelle de paiement réelle (AHM-46) pour déclencher cette confirmation automatiquement.
  - Le stepper de paiement (mockup #pg-cotisation, RICEFW F-004) simule les étapes 1 (article) et
    2 (mode de paiement) uniquement côté client ; l'étape 3 (confirmation) envoie un unique POST
    (W-002 : "POST /cotisations/ avec statut=paye"). Depuis AHM-53, ce statut transmis par le
    client n'est plus jamais fait confiance pour ce flux en libre-service : quel que soit le mode
    de paiement choisi (carte, virement SEPA, PayPal), CotisationViewSet.perform_create impose
    statut=en_attente à la création, aucune passerelle réelle ne pouvant confirmer le paiement.
    Le paiement doit ensuite être confirmé par le Directeur Financier/Admin via `marquer_payee`
    avant qu'une référence de transaction ou un reçu PDF (AHM-17) n'existent. Exception : la
    saisie pour le compte d'un AUTRE membre par le Directeur Financier/Admin (F-015, un membre du
    staff qui constate une transaction déjà reçue, ex. espèces en main propre) conserve le statut
    transmis par le client.
  - Le montant final n'est jamais fait confiance au frontend (CLAUDE.md §8) : pour les types
    d'article au tarif fixe de l'association (cotisation annuelle, frais d'adhésion), le serializer
    recalcule le montant et le libellé côté serveur — voir MONTANTS_CATALOGUE ci-dessous.
  - `saisie_par` distingue une écriture en libre-service (le membre paie sa propre cotisation,
    `saisie_par` vide) d'une transaction ajoutée manuellement par le Directeur Financier/Admin
    pour le compte d'un autre membre (RICEFW F-015 "Ajouter une transaction (DG)").
  - RelanceCotisation (AHM-18, RICEFW W-001) journalise les relances email envoyées aux membres
    actifs sans cotisation payée pour l'année N — voir apps.cotisations.tasks pour le pipeline
    Celery Beat. Sert aussi de verrou d'idempotence (contrainte unique) : un même membre ne peut
    pas recevoir deux fois la même relance pour la même année, même si la tâche est rejouée. La
    notification in-app prévue par W-001 (étape 5) est différée à la Phase 2B avec le reste de
    apps.notifications (CLAUDE.md §7) — ce module ne couvre que l'email.
  - ConfigurationRelance (AHM-54, suite retour utilisateur sur AHM-18) permet au Directeur
    Financier/Admin de définir, année de cotisation par année de cotisation, la date d'échéance
    utilisée pour calculer les 3 checkpoints (J-30/J-7/J+1) — voir
    apps.cotisations.tasks._checkpoints_du_jour. Seule la date pivot est configurable, pas les
    décalages eux-mêmes. Une année sans ligne ici retombe sur le comportement historique
    (échéance au 1er janvier de cette année), pour ne rien casser en production tant que le
    Directeur Financier n'a pas explicitement configuré l'année en cours.
  - ArticleCatalogue (ajouté le 2026-09-17, demande utilisateur : "Artikeln / Elemente bei
    Cotisation müssen vom APP-Admin verwaltbar sein (Anlegen / Aktualisieren / Deaktivieren)") —
    décision actée avec l'utilisateur : ces articles s'ajoutent aux 4 types fixes de TypeArticle
    ci-dessous, ils ne les remplacent jamais. Un membre peut souscrire librement à n'importe quel
    article actif de ce catalogue (ex. "Beitrag Unterstützer") au même titre qu'une cotisation
    annuelle — voir TypeArticle.AUTRE et Cotisation.article_catalogue. Réservé à l'Administrateur
    App (Role.SUPER_ADMIN) — décision actée avec l'utilisateur, littéralement "APP-Admin".
    `actif=False` retire l'article de la sélection pour tout nouveau paiement sans jamais toucher
    aux Cotisation déjà enregistrées qui le référencent (jamais de suppression physique — voir
    on_delete=PROTECT ci-dessous, pas d'action DELETE exposée côté API : "Deaktivieren", jamais
    "Löschen").
  - `ArticleCatalogue.type_fixe` (ajouté le 2026-09-17, suite au retour "die bestehende [Cotisation
    annuelle/Frais d'adhésion] müssen auch verwaltbar sein") : les tarifs de cotisation/adhésion ne
    sont plus un dict Python figé (MONTANTS_CATALOGUE ci-dessous ne sert plus que de valeur de
    repli défensive) — ils vivent désormais dans CE MÊME catalogue, comme deux lignes techniques
    seedées une fois par la migration 0006 et identifiées par `type_fixe` (jamais créées/renommées
    via l'API : champ en lecture seule, voir ArticleCatalogueSerializer). Décision actée avec
    l'utilisateur (AskUserQuestion du 2026-09-17) : seuls cotisation/adhésion (tarif fixe) sont
    concernés, pas "don" (montant libre, rien à administrer) ; et ces deux lignes sont aussi
    désactivables que les articles personnalisés (`actif=False` masque le type dans le stepper et
    fait échouer toute nouvelle tentative de paiement de ce type — voir CotisationSerializer.
    validate, montant_catalogue/article_catalogue_fixe_actif ci-dessous). Seul le montant (et
    l'activation) de ces deux lignes est modifiable ; leur libellé reste ignoré en écriture (voir
    ArticleCatalogueSerializer.update) — l'intitulé affiché aux membres reste piloté par les clés
    i18n existantes (cotisations.json), pas par ce champ, pour ne pas casser la traduction FR/DE.
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
    # Ajouté le 2026-09-17 — voir ArticleCatalogue ci-dessous : un article personnalisé créé par
    # l'App-Admin, jamais un 5e tarif fixe géré par MONTANTS_CATALOGUE.
    AUTRE = "autre", _("Article personnalisé")


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


# Tarifs fixes de l'association (FDD §3.2) — ne sert plus que de valeur de repli défensive pour
# montant_catalogue() ci-dessous (cas où la ligne ArticleCatalogue.type_fixe correspondante
# n'existe pas encore, ex. avant la migration 0006 de seed) : la source de vérité normale est
# désormais ArticleCatalogue (voir docstring de module, "type_fixe"). "evenement" (pas encore de
# modèle Evenement pour porter un prix — à revisiter en Phase 2A) et "don" (montant libre par
# définition) restent hors catalogue, au montant transmis par le client.
MONTANTS_CATALOGUE = {
    TypeArticle.COTISATION: Decimal("45.00"),
    TypeArticle.ADHESION: Decimal("15.00"),
}

# Types éligibles à ArticleCatalogue.type_fixe — uniquement les 2 tarifs fixes, jamais "don"
# (montant libre, rien à administrer) ni "evenement"/"autre" (décision actée avec l'utilisateur,
# AskUserQuestion du 2026-09-17).
TYPES_FIXES_CATALOGABLES = [TypeArticle.COTISATION, TypeArticle.ADHESION]


class ArticleCatalogue(models.Model):
    """Article de paiement personnalisé, géré par l'Administrateur App (voir docstring de
    module) — vient s'ajouter aux 4 types fixes de TypeArticle, jamais les remplacer. Contient
    aussi, depuis le 2026-09-17, les 2 lignes techniques `type_fixe` représentant les tarifs
    cotisation/adhésion (voir docstring de module)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    libelle = models.CharField(max_length=200)
    montant = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    # Retire l'article de la sélection pour tout nouveau paiement (voir Cotisation.article_
    # catalogue, on_delete=PROTECT) — jamais de suppression physique, jamais exposé en DELETE
    # côté API (voir views.ArticleCatalogueViewSet) : "Deaktivieren", pas "Löschen".
    actif = models.BooleanField(default=True)
    # None pour un article personnalisé (cas normal) ; TypeArticle.COTISATION/ADHESION pour l'une
    # des 2 lignes techniques seedées par la migration 0006 — jamais renseigné via l'API (champ
    # en lecture seule, voir ArticleCatalogueSerializer) : voir docstring de module.
    type_fixe = models.CharField(
        max_length=20,
        choices=[(t, t.label) for t in TYPES_FIXES_CATALOGABLES],
        null=True,
        blank=True,
        unique=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "cotisations_articles_catalogue"
        verbose_name = _("Article du catalogue")
        verbose_name_plural = _("Articles du catalogue")
        ordering = ["libelle"]

    def __str__(self):
        return f"{self.libelle} ({self.montant} €)"


def montant_catalogue(type_article: str) -> Decimal:
    """Tarif actuellement configuré pour un type fixe (cotisation/adhésion) — lu depuis
    ArticleCatalogue.type_fixe (retour utilisateur du 2026-09-17). Repli sur l'ancien dict
    MONTANTS_CATALOGUE si la ligne de seed n'existe pas encore (défensif, ne devrait pas arriver
    en usage normal après la migration 0006) — ne doit jamais lever, CLAUDE.md §8 impose un
    montant recalculé côté serveur pour toute cotisation créée."""
    article = ArticleCatalogue.objects.filter(type_fixe=type_article).first()
    if article is not None:
        return article.montant
    return MONTANTS_CATALOGUE[type_article]


def article_catalogue_fixe_actif(type_article: str) -> bool:
    """True si le type fixe (cotisation/adhésion) est actuellement proposé aux membres (voir
    docstring de module) — False uniquement si l'Administrateur App l'a explicitement désactivé.
    Fail-open (True) si la ligne de seed n'existe pas encore : ne bloque jamais un paiement à
    cause d'une donnée absente."""
    article = ArticleCatalogue.objects.filter(type_fixe=type_article).first()
    return article is None or article.actif


class Cotisation(models.Model):
    """Écriture de paiement — voir mockup #pg-cotisation (stepper + historique des paiements)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    membre = models.ForeignKey(
        "membres.Membre",
        on_delete=models.PROTECT,
        related_name="cotisations",
    )

    type_article = models.CharField(max_length=20, choices=TypeArticle.choices)
    # Renseigné uniquement quand type_article=autre — voir ArticleCatalogue et
    # CotisationSerializer.validate. on_delete=PROTECT : un article du catalogue référencé par au
    # moins une Cotisation ne peut jamais être supprimé (il est de toute façon seulement
    # désactivable, jamais supprimable, voir ArticleCatalogue.actif).
    article_catalogue = models.ForeignKey(
        ArticleCatalogue,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="cotisations",
    )
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


class CheckpointRelance(models.TextChoices):
    """
    Les 3 échéances du pipeline de relance (RICEFW W-001 "Filtrer J-30/J-7/J+1"), ancrées sur le
    1er janvier de l'année de cotisation N — décision actée avec l'utilisateur (AHM-18) en
    l'absence d'une date d'échéance individuelle par membre dans le FDD/RICEFW d'origine :
      J_MOINS_30 -> 2 décembre N-1
      J_MOINS_7  -> 25 décembre N-1
      J_PLUS_1   -> 2 janvier N (cotisation en retard)
    Voir apps.cotisations.tasks._checkpoint_du_jour pour le calcul.
    """

    J_MOINS_30 = "j_moins_30", _("J-30")
    J_MOINS_7 = "j_moins_7", _("J-7")
    J_PLUS_1 = "j_plus_1", _("J+1")


class RelanceCotisation(models.Model):
    """Journal des relances email envoyées — voir docstring de module ci-dessus et tasks.py."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membre = models.ForeignKey(
        "membres.Membre",
        on_delete=models.CASCADE,
        related_name="relances_cotisation",
    )
    annee = models.PositiveSmallIntegerField()
    checkpoint = models.CharField(max_length=20, choices=CheckpointRelance.choices)
    envoyee_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "relances_cotisation"
        verbose_name = _("Relance cotisation")
        verbose_name_plural = _("Relances cotisation")
        ordering = ["-envoyee_le"]
        constraints = [
            models.UniqueConstraint(
                fields=["membre", "annee", "checkpoint"],
                name="unique_relance_par_membre_annee_checkpoint",
            )
        ]

    def __str__(self):
        return f"{self.get_checkpoint_display()} {self.annee} — {self.membre}"


class ConfigurationRelance(models.Model):
    """
    Date d'échéance de la cotisation annuelle, configurable par année par le Directeur
    Financier/Admin (AHM-54). Remplace l'ancrage fixe au 1er janvier introduit par AHM-18 : les 3
    checkpoints (J-30/J-7/J+1, voir CheckpointRelance) restent calculés relativement à cette date,
    seule la date pivot elle-même est configurable. Une année de cotisation sans ligne ici
    retombe sur le comportement historique (échéance au 1er janvier de cette année) — voir
    apps.cotisations.tasks._checkpoints_du_jour.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annee = models.PositiveSmallIntegerField(
        unique=True,
        help_text=_("Année de cotisation à laquelle s'applique cette échéance."),
    )
    date_echeance = models.DateField(
        help_text=_("Date à partir de laquelle la cotisation de cette année est en retard.")
    )
    modifie_par = models.ForeignKey(
        "membres.Membre",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
        help_text=_("Directeur Financier/Admin ayant défini ou modifié cette échéance en dernier."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "configurations_relance"
        verbose_name = _("Configuration de relance")
        verbose_name_plural = _("Configurations de relance")
        ordering = ["-annee"]

    def __str__(self):
        return f"Échéance {self.annee} : {self.date_echeance:%d/%m/%Y}"

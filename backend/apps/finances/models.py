"""
Modèles — app finances (demande utilisateur du 2026-10-06 : module "Statistiken & KPIs"
étendu pour le service financier — saisie des coûts, Jahresbilanz, Budget vs. Ist).

  - CategorieDepense : liste configurable (la forme juridique de CID n'est pas encore figée —
    voir seed dans la migration 0001 ; aucune catégorie n'est codée en dur côté code).
  - Depense : une dépense avec justificatif optionnel. Principe des quatre yeux : une dépense
    saisie est EN_ATTENTE et ne compte dans aucun KPI/bilan tant qu'une AUTRE personne ne l'a
    pas APPROUVÉE (voir views.DepenseViewSet). Une dépense approuvée est figée (registre
    append-only, comme Cotisation) ; seule une dépense en attente/rejetée peut être modifiée ou
    supprimée.
  - BudgetAnnuel : budget prévu par année et catégorie (Budget vs. Ist).
"""

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.adhesions.storage import JustificatifsStorage


class CategorieDepense(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # `nom` = Französisch (Referenz, eindeutig). `nom_de`/`nom_ar` sind optionale Übersetzungen ;
    # fehlt eine, zeigt die Oberfläche den französischen Namen (siehe `namen`).
    nom = models.CharField(max_length=100, unique=True)
    nom_de = models.CharField(max_length=100, blank=True, default="")
    nom_ar = models.CharField(max_length=100, blank=True, default="")
    actif = models.BooleanField(default=True)
    ordre = models.PositiveSmallIntegerField(default=0)
    # Genau eine Kategorie trägt dieses Kennzeichen: ihr Jahresbudget ist der Topf für die
    # Plan-Kosten aller Projekte des Jahres (siehe apps.projets.budget).
    projektbudget = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["ordre", "nom"]
        verbose_name = _("Catégorie de dépense")
        verbose_name_plural = _("Catégories de dépense")

    def __str__(self):
        return self.nom

    @property
    def namen(self) -> dict:
        """Name je Sprache, mit Rückfall auf Französisch."""
        return {"fr": self.nom, "de": self.nom_de or self.nom, "ar": self.nom_ar or self.nom}


class StatutDepense(models.TextChoices):
    EN_ATTENTE = "en_attente", _("En attente d'approbation")
    APPROUVEE = "approuvee", _("Approuvée")
    REJETEE = "rejetee", _("Rejetée")


def depense_justificatif_path(instance, filename):
    # `filename` est déjà réécrit côté serveur (<uuid>.<extension détectée>) par le serializer.
    return f"depenses/{instance.date_depense.year}/{filename}"


class Depense(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date_depense = models.DateField()
    montant = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    categorie = models.ForeignKey(
        CategorieDepense, on_delete=models.PROTECT, related_name="depenses"
    )
    fournisseur = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    evenement = models.ForeignKey(
        "evenements.Evenement",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="depenses",
    )
    projet = models.ForeignKey(
        "projets.Projet",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="depenses",
    )
    aufgabe = models.ForeignKey(
        "projets.Aufgabe",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="depenses",
    )
    justificatif = models.FileField(
        upload_to=depense_justificatif_path, storage=JustificatifsStorage(), null=True, blank=True
    )
    statut = models.CharField(
        max_length=20, choices=StatutDepense.choices, default=StatutDepense.EN_ATTENTE
    )
    saisie_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="depenses_saisies",
    )
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="depenses_decidees",
    )
    date_decision = models.DateTimeField(null=True, blank=True)
    motif_rejet = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_depense", "-created_at"]
        indexes = [
            models.Index(fields=["date_depense", "statut"], name="finances_dep_date_statut_idx")
        ]

    def __str__(self):
        return f"{self.date_depense} {self.fournisseur} {self.montant}"


class BudgetAnnuel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annee = models.PositiveSmallIntegerField()
    categorie = models.ForeignKey(
        CategorieDepense, on_delete=models.CASCADE, related_name="budgets"
    )
    montant = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )

    class Meta:
        ordering = ["annee", "categorie__ordre"]
        constraints = [
            models.UniqueConstraint(fields=["annee", "categorie"], name="uniq_budget_annee_cat")
        ]

    def __str__(self):
        return f"{self.annee} {self.categorie}: {self.montant}"


class Gesamtbudget(models.Model):
    """Gesamtbudget eines Geschäftsjahres. Die Kategorie-Budgets (`BudgetAnnuel`) werden davon
    abgezogen und dürfen es zusammen nie überschreiten."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    annee = models.PositiveSmallIntegerField(unique=True)
    montant = models.DecimalField(
        max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.00"))]
    )

    class Meta:
        ordering = ["annee"]

    def __str__(self):
        return f"{self.annee}: {self.montant}"


class AktionProtokoll(models.TextChoices):
    ERSTELLT = "erstellt", _("Erstellt")
    GEAENDERT = "geaendert", _("Geändert")
    GELOESCHT = "geloescht", _("Gelöscht")
    FREIGEGEBEN = "freigegeben", _("Freigegeben")
    ABGELEHNT = "abgelehnt", _("Abgelehnt")
    BUDGET = "budget", _("Budget gesetzt")
    ABGESCHLOSSEN = "abgeschlossen", _("Jahr abgeschlossen")
    WIEDERGEOEFFNET = "wiedergeoeffnet", _("Jahr wiedereröffnet")


class FinanzProtokoll(models.Model):
    """Änderungsprotokoll (append-only) : wer hat wann was an Ausgaben, Kategorien, Budget und
    Jahresabschluss getan. `benutzer_name` ist eine Momentaufnahme, damit der Eintrag auch nach
    dem Löschen des Kontos lesbar bleibt ; `zusammenfassung` enthält bei gelöschten Ausgaben die
    wesentlichen Daten, da das Objekt selbst dann nicht mehr existiert."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    zeitpunkt = models.DateTimeField(auto_now_add=True)
    benutzer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    benutzer_name = models.CharField(max_length=200)
    aktion = models.CharField(max_length=20, choices=AktionProtokoll.choices)
    objekt_typ = models.CharField(max_length=20)  # depense | categorie | budget | jahr
    objekt_id = models.CharField(max_length=64, blank=True)
    annee = models.PositiveSmallIntegerField(null=True, blank=True)
    zusammenfassung = models.CharField(max_length=300)
    aenderungen = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-zeitpunkt"]
        indexes = [models.Index(fields=["annee", "zeitpunkt"], name="finances_prot_annee_idx")]


class Jahresabschluss(models.Model):
    """Ein abgeschlossenes Geschäftsjahr sperrt Ausgaben und Budget dieses Jahres. `snapshot`
    hält die Eckzahlen zum Abschlusszeitpunkt fest (Einnahmen, Ausgaben, Ergebnis), damit sich
    später nachweisen lässt, ob sich die Zahlen nach dem Abschluss noch verändert haben."""

    annee = models.PositiveSmallIntegerField(unique=True)
    aktiv = models.BooleanField(default=True)
    abgeschlossen_am = models.DateTimeField()
    abgeschlossen_durch = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    snapshot = models.JSONField(default=dict)
    wiedergeoeffnet_am = models.DateTimeField(null=True, blank=True)
    wiedergeoeffnet_durch = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    wiedereroeffnung_grund = models.TextField(blank=True)

    class Meta:
        ordering = ["-annee"]

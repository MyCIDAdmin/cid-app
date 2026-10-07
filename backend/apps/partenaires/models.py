"""Business Partner & Lieferanten (Nutzerwunsch 2026-10-07) : Stammdaten, Verknüpfung mit
Projekten/Aktionen, Veranstaltungen und Shop-Produkten, Bewertung nach Kriterien und Kategorien
für gezielte Listen ("alle Caterer", "alle Druckereien"). Partner werden nie gelöscht, sondern
archiviert (Historie von Verknüpfungen und Bewertungen bleibt erhalten)."""

import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q


class PartnerTyp(models.TextChoices):
    PARTNER = "partner", "Business Partner"
    LIEFERANT = "lieferant", "Lieferant"
    BEIDES = "beides", "Partner & Lieferant"


class PartnerStatus(models.TextChoices):
    AKTIV = "aktiv", "Aktiv"
    INAKTIV = "inaktiv", "Inaktiv"
    ARCHIVIERT = "archiviert", "Archiviert"


class PartnerKategorie(models.Model):
    """Frei pflegbare Kategorie (z. B. Catering, Druck & Werbung, Location)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField("Name (Deutsch)", max_length=100, unique=True)
    nom_fr = models.CharField("Name (Französisch)", max_length=100, blank=True)
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["nom"]
        verbose_name = "Partner-Kategorie"
        verbose_name_plural = "Partner-Kategorien"

    def __str__(self):
        return self.nom


class Partner(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nom = models.CharField("Name", max_length=200)
    typ = models.CharField(max_length=10, choices=PartnerTyp.choices, default=PartnerTyp.PARTNER)
    statut = models.CharField(
        max_length=12, choices=PartnerStatus.choices, default=PartnerStatus.AKTIV
    )
    kategorien = models.ManyToManyField(PartnerKategorie, blank=True, related_name="partner")
    bevorzugt = models.BooleanField(
        default=False, help_text="Bevorzugter Partner/Lieferant (in Listen hervorgehoben)."
    )

    ansprechpartner = models.CharField(max_length=200, blank=True)
    email = models.EmailField(blank=True)
    telefon = models.CharField(max_length=50, blank=True)
    website = models.URLField(blank=True)
    adresse = models.CharField(max_length=255, blank=True)
    code_postal = models.CharField(max_length=20, blank=True)
    ville = models.CharField(max_length=100, blank=True)
    pays = models.CharField(max_length=100, blank=True, default="Deutschland")
    ust_id = models.CharField("USt-IdNr.", max_length=30, blank=True)
    zahlungsziel_tage = models.PositiveSmallIntegerField(null=True, blank=True)
    notizen = models.TextField("Interne Notizen", blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["nom"]
        verbose_name = "Business Partner"
        verbose_name_plural = "Business Partner & Lieferanten"

    def __str__(self):
        return self.nom


class VerknuepfungRolle(models.TextChoices):
    LIEFERANT = "lieferant", "Lieferant"
    SPONSOR = "sponsor", "Sponsor"
    KOOPERATION = "kooperation", "Kooperationspartner"
    LOCATION = "location", "Location"
    DIENSTLEISTER = "dienstleister", "Dienstleister"
    SONSTIGE = "sonstige", "Sonstige"


class PartnerVerknuepfung(models.Model):
    """Verknüpfung eines Partners mit genau EINEM Ziel (Projekt/Aktion, Veranstaltung oder
    Shop-Produkt) — echte Fremdschlüssel statt generischer Verweise, damit Löschschutz und
    Rückwärts-Abfragen (alle Partner eines Projekts) einfach bleiben."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="verknuepfungen")
    projet = models.ForeignKey(
        "projets.Projet",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="partner_verknuepfungen",
    )
    evenement = models.ForeignKey(
        "evenements.Evenement",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="partner_verknuepfungen",
    )
    produit = models.ForeignKey(
        "boutique.Produit",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="partner_verknuepfungen",
    )
    rolle = models.CharField(
        max_length=15, choices=VerknuepfungRolle.choices, default=VerknuepfungRolle.SONSTIGE
    )
    notiz = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                check=(
                    Q(projet__isnull=False, evenement__isnull=True, produit__isnull=True)
                    | Q(projet__isnull=True, evenement__isnull=False, produit__isnull=True)
                    | Q(projet__isnull=True, evenement__isnull=True, produit__isnull=False)
                ),
                name="partner_verknuepfung_genau_ein_ziel",
            ),
        ]

    def __str__(self):
        return f"{self.partner} → {self.ziel_typ}"

    @property
    def ziel_typ(self) -> str:
        if self.projet_id:
            return "projet"
        if self.evenement_id:
            return "evenement"
        return "produit"

    @property
    def ziel(self):
        return self.projet or self.evenement or self.produit

    @property
    def ziel_label(self) -> str:
        ziel = self.ziel
        if ziel is None:
            return ""
        return getattr(ziel, "titre", None) or getattr(ziel, "nom", "")


def _note():
    return [MinValueValidator(1), MaxValueValidator(5)]


class PartnerBewertung(models.Model):
    """Bewertung nach vier Kriterien (je 1-5 Sterne) plus Kommentar, optional mit Bezug zu einer
    Verknüpfung (z. B. "Catering beim Sommerfest")."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="bewertungen")
    bewerter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    verknuepfung = models.ForeignKey(
        PartnerVerknuepfung,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bewertungen",
    )
    qualitaet = models.PositiveSmallIntegerField(validators=_note())
    preis_leistung = models.PositiveSmallIntegerField(validators=_note())
    zuverlaessigkeit = models.PositiveSmallIntegerField(validators=_note())
    kommunikation = models.PositiveSmallIntegerField(validators=_note())
    kommentar = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def schnitt(self) -> float:
        return round(
            (self.qualitaet + self.preis_leistung + self.zuverlaessigkeit + self.kommunikation) / 4,
            2,
        )

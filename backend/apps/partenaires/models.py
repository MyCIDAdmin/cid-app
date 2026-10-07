"""Business Partner & Lieferanten (Nutzerwunsch 2026-10-07) : Stammdaten, Verknüpfung mit
Projekten/Aktionen, Veranstaltungen und Shop-Produkten, Bewertung nach Kriterien und Kategorien
für gezielte Listen ("alle Caterer", "alle Druckereien"). Partner werden nie gelöscht, sondern
archiviert (Historie von Verknüpfungen und Bewertungen bleibt erhalten)."""

import uuid
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.adhesions.storage import JustificatifsStorage
from apps.projets.storage import ProjetsStorage


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


def partner_logo_path(instance, filename):
    # Öffentlicher Bucket "projets" (Logos erscheinen auf Projekt-/Veranstaltungsseiten) ;
    # `filename` wird vom Validator serverseitig neu vergeben.
    return f"partner-logos/{instance.pk}/{uuid.uuid4()}_{filename}"


def partner_dokument_path(instance, filename):
    # Privater Bucket "justificatifs" (Verträge, Angebote) — nur über signierte URLs.
    return f"partner-dokumente/{instance.partner_id}/{filename}"


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
    auf_startseite = models.BooleanField(
        default=False,
        help_text='Logo im Banner "Unsere Sponsoren und Business Partner" der Startseite zeigen.',
    )

    logo = models.ImageField(
        upload_to=partner_logo_path, storage=ProjetsStorage(), null=True, blank=True
    )
    # Zentrale Kontaktdaten der Firma ; Personen stehen in PartnerKontakt.
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


class PartnerKontakt(models.Model):
    """Eine Ansprechperson des Partners (mehrere je Partner, einer davon Hauptkontakt)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="kontakte")
    name = models.CharField(max_length=200)
    funktion = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    telefon = models.CharField(max_length=50, blank=True)
    hauptkontakt = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-hauptkontakt", "name"]
        verbose_name = "Ansprechperson"
        verbose_name_plural = "Ansprechpersonen"

    def __str__(self):
        return f"{self.name} ({self.partner})"


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
    logo_anzeigen = models.BooleanField(
        default=False,
        help_text="Partner-Logo auf der Seite des Projekts / der Veranstaltung zeigen.",
    )
    bewertung_erinnert = models.BooleanField(default=False)
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


class DokumentTyp(models.TextChoices):
    VERTRAG = "vertrag", "Vertrag"
    ANGEBOT = "angebot", "Angebot"
    SONSTIGES = "sonstiges", "Sonstiges"


class PartnerDokument(models.Model):
    """Vertrag/Angebot/sonstiges Dokument eines Partners. `gueltig_bis` ist bei Verträgen das
    Vertragsende (Erinnerung 60 und 14 Tage vorher, siehe tasks.py)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="dokumente")
    typ = models.CharField(max_length=10, choices=DokumentTyp.choices, default=DokumentTyp.VERTRAG)
    titel = models.CharField(max_length=200)
    datei = models.FileField(upload_to=partner_dokument_path, storage=JustificatifsStorage())
    gueltig_bis = models.DateField(null=True, blank=True)
    notiz = models.CharField(max_length=300, blank=True)
    hochgeladen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    erinnert_60 = models.BooleanField(default=False)
    erinnert_14 = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["gueltig_bis", "-created_at"]
        verbose_name = "Partner-Dokument"
        verbose_name_plural = "Partner-Dokumente"

    def __str__(self):
        return f"{self.titel} ({self.partner})"


class AngebotStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    ZUSCHLAG = "zuschlag", "Zuschlag"
    ABGELEHNT = "abgelehnt", "Abgelehnt"


class Angebot(models.Model):
    """Angebot eines Partners für ein Projekt/eine Aktion (Angebotsvergleich) — je Projekt
    höchstens ein Zuschlag."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    projet = models.ForeignKey(
        "projets.Projet", on_delete=models.CASCADE, related_name="partner_angebote"
    )
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="angebote")
    betrag = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    gueltig_bis = models.DateField(null=True, blank=True)
    beschreibung = models.CharField(max_length=300, blank=True)
    dokument = models.ForeignKey(
        PartnerDokument, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status = models.CharField(
        max_length=10, choices=AngebotStatus.choices, default=AngebotStatus.OFFEN
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["betrag", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["projet"],
                condition=Q(status="zuschlag"),
                name="angebot_ein_zuschlag_je_projekt",
            ),
        ]

    def __str__(self):
        return f"{self.partner} → {self.projet_id}: {self.betrag}"


class EinnahmeArt(models.TextChoices):
    SPONSORING = "sponsoring", "Sponsoring"
    SPENDE = "spende", "Spende"
    SONSTIGE = "sonstige", "Sonstige Einnahme"


class PartnerEinnahme(models.Model):
    """Einnahme von einem Partner (z. B. Sponsoring-Betrag) — Gegenstück zu den genehmigten
    Ausgaben (`finances.Depense.partner`) für das Partner-Reporting (Umsatz = Einnahmen +
    Ausgaben)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    partner = models.ForeignKey(Partner, on_delete=models.CASCADE, related_name="einnahmen")
    datum = models.DateField()
    betrag = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))]
    )
    art = models.CharField(
        max_length=12, choices=EinnahmeArt.choices, default=EinnahmeArt.SPONSORING
    )
    bezeichnung = models.CharField(max_length=200, blank=True)
    projet = models.ForeignKey(
        "projets.Projet", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    evenement = models.ForeignKey(
        "evenements.Evenement", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-datum", "-created_at"]
        verbose_name = "Partner-Einnahme"
        verbose_name_plural = "Partner-Einnahmen"

    def __str__(self):
        return f"{self.partner} {self.datum} {self.betrag}"

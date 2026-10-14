"""Regionen (Release 26) : vom App Admin verwaltete Regionen (Bundesland → Region), Standorte
(Städte) und die Verantwortlichen, die die Regionsseite gestalten. Grundlage für regionale
Veranstaltungen und den Regionen-Wettbewerb (siehe Konzept „Regionen und Wettbewerb“)."""

import uuid

from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

from apps.membres.models import Bundesland
from apps.projets.storage import ProjetsStorage

# Diese Kennungen sind Routen unterhalb von /regionen/ und dürfen nie als Slug einer Region dienen.
RESERVIERTE_SLUGS = {"personen", "verwaltung", "veranstaltungen", "public"}

FARBE_PRUEFUNG = RegexValidator(r"^#[0-9a-fA-F]{6}$", "Farbe im Format #RRGGBB erwartet.")


def region_banner_path(instance, filename):
    # Öffentlicher Bucket „projets“ (Bilder sind für alle angemeldeten Konten sichtbar) ;
    # `filename` wird vom Validator serverseitig neu vergeben.
    return f"regionen/{instance.pk}/banner/{uuid.uuid4()}_{filename}"


def verantwortlicher_foto_path(instance, filename):
    return f"regionen/{instance.region_id}/personen/{uuid.uuid4()}_{filename}"


def veranstaltung_bild_path(instance, filename):
    return f"regionen/{instance.region_id}/veranstaltungen/{uuid.uuid4()}_{filename}"


def beitrag_bild_path(instance, filename):
    return f"regionen/{instance.region_id}/beitraege/{uuid.uuid4()}_{filename}"


class Region(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=100, unique=True)
    farbe = models.CharField(max_length=7, default="#1d4ed8", validators=[FARBE_PRUEFUNG])
    reihenfolge = models.PositiveSmallIntegerField(default=0)
    aktiv = models.BooleanField(default=True)
    beschreibung_de = models.TextField(max_length=4000, blank=True)
    beschreibung_fr = models.TextField(max_length=4000, blank=True)
    banner = models.ImageField(
        upload_to=region_banner_path, storage=ProjetsStorage(), null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["reihenfolge", "name"]
        verbose_name = "Region"
        verbose_name_plural = "Regionen"

    def __str__(self):
        return self.name


class RegionLand(models.Model):
    """Ordnet ein Bundesland genau einer Region zu (jedes Land gehört zu höchstens einer)."""

    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="laender")
    land = models.CharField(max_length=2, choices=Bundesland.choices, unique=True)

    class Meta:
        ordering = ["land"]

    def __str__(self):
        return f"{self.land} → {self.region_id}"


class Standort(models.Model):
    """Treffpunkt/Stadt innerhalb einer Region (z. B. Hamburg, Köln)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="standorte")
    name = models.CharField(max_length=100)
    land = models.CharField(max_length=2, choices=Bundesland.choices, blank=True)
    aktiv = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["region", "name"], name="regionen_standort_name")
        ]

    def __str__(self):
        return self.name


class Verantwortlicher(models.Model):
    """Ansprechperson einer Region (optional eines Standorts). Die Vorstellungskarte gestaltet
    die Person selbst ; Kontaktdaten erscheinen nur, wenn sie hier freiwillig eingetragen sind."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="verantwortliche")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="regionsverantwortung"
    )
    standort = models.ForeignKey(
        Standort, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    anzeige_name = models.CharField(max_length=100)
    funktion = models.CharField(max_length=100, blank=True)
    vorstellung = models.TextField(max_length=1000, blank=True)
    foto = models.ImageField(
        upload_to=verantwortlicher_foto_path, storage=ProjetsStorage(), null=True, blank=True
    )
    kontakt_email = models.EmailField(blank=True)
    reihenfolge = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["reihenfolge", "anzeige_name"]
        constraints = [
            models.UniqueConstraint(fields=["region", "user"], name="regionen_verantw_eindeutig")
        ]

    def __str__(self):
        return f"{self.anzeige_name} ({self.region_id})"


# Feste Auswahl an Reaktionen ; gespeichert wird die Kennung, die Oberfläche zeigt das Emoji.
REAKTIONEN = ("daumen", "herz", "feier", "applaus", "staunen")


class Beitrag(models.Model):
    """Neuigkeit oder Treffen-Rückblick auf der Regionsseite (Release 27). Keine Kommentare ;
    das Büro kann einen Beitrag ausblenden (er bleibt für Büro und Verantwortliche sichtbar)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="beitraege")
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    autor_name = models.CharField(max_length=100, blank=True)
    titel = models.CharField(max_length=150)
    text = models.TextField(max_length=4000)
    bild = models.ImageField(
        upload_to=beitrag_bild_path, storage=ProjetsStorage(), null=True, blank=True
    )
    ausgeblendet = models.BooleanField(default=False)
    ausgeblendet_grund = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["region", "-created_at"], name="regionen_beitrag_region")]

    def __str__(self):
        return self.titel


class Reaktion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    beitrag = models.ForeignKey(Beitrag, on_delete=models.CASCADE, related_name="reaktionen")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    art = models.CharField(max_length=10)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["beitrag", "user", "art"], name="regionen_reaktion_eindeutig"
            )
        ]


class VeranstaltungStatus(models.TextChoices):
    ENTWURF = "entwurf", "Entwurf"
    EINGEREICHT = "eingereicht", "Eingereicht"
    VEROEFFENTLICHT = "veroeffentlicht", "Veröffentlicht"
    ZURUECKGEWIESEN = "zurueckgewiesen", "Zurückgewiesen"
    ABGESCHLOSSEN = "abgeschlossen", "Abgeschlossen"
    ABGESAGT = "abgesagt", "Abgesagt"


class Veranstaltung(models.Model):
    """Regionales Treffen (Release 28). Verantwortliche legen an und reichen ein, das Büro gibt
    frei und schließt nach dem Treffen ab ; erst die Anwesenheit abgeschlossener Treffen zählt
    später für den Wettbewerb. Bewusst getrennt vom Vereins-Veranstaltungsmodul (Beitrag, Zahlung,
    Mitgliedschaft), damit auch Konten ohne Mitgliedschaft teilnehmen können."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    region = models.ForeignKey(Region, on_delete=models.CASCADE, related_name="veranstaltungen")
    standort = models.ForeignKey(
        Standort, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    titel = models.CharField(max_length=150)
    beschreibung = models.TextField(max_length=4000, blank=True)
    datum = models.DateField()
    uhrzeit = models.TimeField(null=True, blank=True)
    ort = models.CharField(max_length=200)
    bild = models.ImageField(
        upload_to=veranstaltung_bild_path, storage=ProjetsStorage(), null=True, blank=True
    )
    max_teilnehmer = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=VeranstaltungStatus.choices, default=VeranstaltungStatus.ENTWURF
    )
    ablehngrund = models.CharField(max_length=200, blank=True)
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    ersteller_name = models.CharField(max_length=100, blank=True)
    eingereicht_am = models.DateTimeField(null=True, blank=True)
    entschieden_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    veroeffentlicht_am = models.DateTimeField(null=True, blank=True)
    abgeschlossen_am = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["datum", "uhrzeit", "created_at"]
        indexes = [
            models.Index(fields=["region", "status", "datum"], name="regionen_veranst_region")
        ]

    def __str__(self):
        return f"{self.titel} ({self.datum})"


class Teilnahme(models.Model):
    """Anmeldung eines Kontos zu einem regionalen Treffen ; `anwesend` setzen die Verantwortlichen
    nach dem Treffen (Häkchen)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    veranstaltung = models.ForeignKey(
        Veranstaltung, on_delete=models.CASCADE, related_name="teilnahmen"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    anwesend = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["veranstaltung", "user"], name="regionen_teilnahme_eindeutig"
            )
        ]

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
RESERVIERTE_SLUGS = {"personen", "verwaltung"}

FARBE_PRUEFUNG = RegexValidator(r"^#[0-9a-fA-F]{6}$", "Farbe im Format #RRGGBB erwartet.")


def region_banner_path(instance, filename):
    # Öffentlicher Bucket „projets“ (Bilder sind für alle angemeldeten Konten sichtbar) ;
    # `filename` wird vom Validator serverseitig neu vergeben.
    return f"regionen/{instance.pk}/banner/{uuid.uuid4()}_{filename}"


def verantwortlicher_foto_path(instance, filename):
    return f"regionen/{instance.region_id}/personen/{uuid.uuid4()}_{filename}"


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

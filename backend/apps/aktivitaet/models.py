"""Aktivität (Release 22) : erkannte Auffälligkeiten des Protokolls."""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class Auffaelligkeit(models.Model):
    """Eine von `regeln.pruefen` erkannte Auffälligkeit. `(regel, schluessel)` ist eindeutig,
    damit dasselbe Ereignis nur einmal gemeldet wird (Schlüssel = Ereignis-ID oder Zeitfenster)."""

    class Status(models.TextChoices):
        OFFEN = "offen", "Offen"
        ERLEDIGT = "erledigt", "Erledigt"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    regel = models.CharField(max_length=40)
    schluessel = models.CharField(max_length=120)
    gewicht = models.CharField(max_length=10, default="warnung")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    erkannt_am = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OFFEN)
    erledigt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    erledigt_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-erkannt_am"]
        constraints = [
            models.UniqueConstraint(
                fields=["regel", "schluessel"], name="aktivitaet_regel_schluessel"
            )
        ]

    def __str__(self):
        return f"{self.regel} ({self.status})"


class Nutzung(models.Model):
    """Nutzungsstatistik (Release 23) : Anzahl der Nutzungsfenster (je 5 Minuten) pro Person, Tag
    und Modul. Bewusst nur Summen — keine Seitenaufrufe, Pfade oder Inhalte. Wird mit dem Konto
    gelöscht und nach `NUTZUNG_AUFBEWAHRUNG_TAGE` Tagen bereinigt."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    tag = models.DateField(db_index=True)
    modul = models.CharField(max_length=30)
    anzahl = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "tag", "modul"], name="aktivitaet_nutzung_eindeutig"
            )
        ]

    def __str__(self):
        return f"{self.tag} {self.modul} ({self.anzahl})"


class Monatsbericht(models.Model):
    """Monatsbericht (Release 24) : Kennzahlen eines abgeschlossenen Monats, einmal pro Monat
    erzeugt und an die App-Admins gesendet. `daten` enthält nur Summen, keine Personen."""

    jahr = models.PositiveSmallIntegerField()
    monat = models.PositiveSmallIntegerField()
    daten = models.JSONField(default=dict)
    erstellt_am = models.DateTimeField(default=timezone.now)
    versendet_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-jahr", "-monat"]
        constraints = [
            models.UniqueConstraint(fields=["jahr", "monat"], name="aktivitaet_bericht_monat")
        ]

    def __str__(self):
        return f"{self.monat:02d}/{self.jahr}"


class RechteReview(models.Model):
    """Vierteljährliche Prüfung der Konten mit erweiterten Rechten (Release 24)."""

    class Status(models.TextChoices):
        OFFEN = "offen", "Offen"
        ABGESCHLOSSEN = "abgeschlossen", "Abgeschlossen"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quartal = models.CharField(max_length=7, unique=True)  # z. B. „2026-Q4“
    erstellt_am = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.OFFEN)
    abgeschlossen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    abgeschlossen_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-quartal"]

    def __str__(self):
        return self.quartal


class RechtePosition(models.Model):
    """Ein Konto im Review — Stand (Name, Rolle, 2FA, Anmeldung) bei der Erstellung."""

    class Entscheidung(models.TextChoices):
        OFFEN = "offen", "Offen"
        BESTAETIGT = "bestaetigt", "Bestätigt"
        ENTZIEHEN = "entziehen", "Rechte entziehen"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    review = models.ForeignKey(RechteReview, on_delete=models.CASCADE, related_name="positionen")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    name = models.CharField(max_length=200)
    email = models.CharField(max_length=254)
    rolle = models.CharField(max_length=300)
    totp = models.BooleanField(default=False)
    letzte_anmeldung = models.DateTimeField(null=True, blank=True)
    entscheidung = models.CharField(
        max_length=12, choices=Entscheidung.choices, default=Entscheidung.OFFEN
    )
    notiz = models.CharField(max_length=200, blank=True)
    entschieden_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    entschieden_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["review", "user"], name="aktivitaet_review_konto")
        ]

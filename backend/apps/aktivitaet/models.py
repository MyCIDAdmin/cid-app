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

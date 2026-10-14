"""Sitzungsmodus und Terminfindung (Release 18).

- Sitzungsmodus : an einem Termin hängen Tagesordnung, Protokoll und Beschlüsse ; aus einem
  Beschluss wird mit einem Klick eine Aufgabe in einem Projekt.
- Terminfindung : „Wann passt es euch?“ — mehrere Terminvorschläge, Teilnehmer antworten mit
  Ja / Vielleicht / Nein, das Bureau wählt einen Vorschlag und daraus entsteht der Termin.
"""

import uuid

from django.conf import settings
from django.db import models


class Tagesordnungspunkt(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    termin = models.ForeignKey("kalender.Termin", on_delete=models.CASCADE, related_name="tops")
    nr = models.PositiveSmallIntegerField(default=1)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)

    class Meta:
        db_table = "kalender_tagesordnung"
        ordering = ["nr", "id"]


class Protokoll(models.Model):
    termin = models.OneToOneField(
        "kalender.Termin", on_delete=models.CASCADE, related_name="protokoll"
    )
    text = models.TextField(blank=True)
    versendet_am = models.DateTimeField(null=True, blank=True)
    geaendert_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "kalender_protokolle"


class Beschluss(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    termin = models.ForeignKey(
        "kalender.Termin", on_delete=models.CASCADE, related_name="beschluesse"
    )
    top = models.ForeignKey(
        Tagesordnungspunkt, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    text = models.TextField()
    verantwortlich = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    frist = models.DateField(null=True, blank=True)
    aufgabe = models.ForeignKey(
        "projets.Aufgabe", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "kalender_beschluesse"
        ordering = ["created_at"]


class UmfrageStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    ENTSCHIEDEN = "entschieden", "Entschieden"
    ABGEBROCHEN = "abgebrochen", "Abgebrochen"


class Terminumfrage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    ort = models.CharField(max_length=255, blank=True)
    dauer_minuten = models.PositiveSmallIntegerField(default=60)
    kategorie = models.CharField(max_length=20, default="sitzung")
    # Sichtbarkeit des späteren Termins (wie bei Termin : Kreis / alle Mitglieder …).
    sichtbarkeit = models.CharField(max_length=20, default="kreis")
    kreis = models.CharField(max_length=10, blank=True, default="bureau")
    projekt = models.ForeignKey(
        "projets.Projet", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    teilnehmer = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="terminumfragen", blank=True
    )
    antwort_bis = models.DateField(null=True, blank=True)
    erinnert_am = models.DateField(null=True, blank=True)  # Release 19 : letzte Erinnerung
    frist_gemeldet = models.BooleanField(default=False)  # Release 19 : Ersteller informiert
    status = models.CharField(
        max_length=12, choices=UmfrageStatus.choices, default=UmfrageStatus.OFFEN
    )
    gewaehlt = models.ForeignKey(
        "kalender.Terminoption", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    termin = models.ForeignKey(
        "kalender.Termin", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="terminumfragen_erstellt"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "kalender_terminumfragen"
        ordering = ["-created_at"]


class Terminoption(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    umfrage = models.ForeignKey(Terminumfrage, on_delete=models.CASCADE, related_name="optionen")
    beginn = models.DateTimeField()
    ende = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "kalender_terminoptionen"
        ordering = ["beginn"]


class Terminstimme(models.Model):
    JA, VIELLEICHT, NEIN = "ja", "vielleicht", "nein"
    ANTWORTEN = [(JA, "Ja"), (VIELLEICHT, "Vielleicht"), (NEIN, "Nein")]

    option = models.ForeignKey(Terminoption, on_delete=models.CASCADE, related_name="stimmen")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    antwort = models.CharField(max_length=12, choices=ANTWORTEN)

    class Meta:
        db_table = "kalender_terminstimmen"
        constraints = [
            models.UniqueConstraint(fields=["option", "user"], name="uniq_kalender_terminstimme")
        ]

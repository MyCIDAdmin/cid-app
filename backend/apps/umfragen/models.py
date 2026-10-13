"""Umfragen (Release 11, Entscheidungen von Ghazi 2026-10-13).

- Zielgruppe pro Umfrage: nur Mitglieder (aktive Fiche) oder jedes Konto („Nur mit Konto“) ;
  ohne Anmeldung ist keine Teilnahme möglich.
- Anonym: Die Antworten hängen an einer `UmfrageEinreichung` OHNE Nutzer ; wer teilgenommen hat,
  steht getrennt in `UmfrageTeilnahme` (nur gegen Doppelteilnahme). So lässt sich eine Antwort
  nicht auf eine Person zurückführen. Namentlich: Einreichung trägt den Nutzer.
- Ergebnisse pro Umfrage einstellbar: nur Verwaltung / Teilnehmende nach Frist / Teilnehmende live.
  Die Verwaltung (Seite „page_quiz“) sieht immer alles ; bei namentlichen Umfragen mit Namen.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.communaute.storage import PublicationsStorage


class Zielgruppe(models.TextChoices):
    MITGLIEDER = "mitglieder", "Nur Mitglieder"
    KONTEN = "konten", "Mitglieder und Nicht-Mitglieder (mit Konto)"


class ErgebnisModus(models.TextChoices):
    ADMIN = "admin", "Nur Verwaltung"
    NACH_FRIST = "nach_frist", "Teilnehmende nach Ablauf der Frist"
    LIVE = "live", "Teilnehmende sofort nach der Teilnahme"


class FrageTyp(models.TextChoices):
    EINZEL = "einzel", "Eine Antwort"
    MEHRFACH = "mehrfach", "Mehrere Antworten"
    FREITEXT = "freitext", "Freitext"


def umfrage_bild_upload_path(instance, filename):
    return f"umfragen/{instance.id}/{filename}"


class Umfrage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    bild = models.ImageField(
        upload_to=umfrage_bild_upload_path, storage=PublicationsStorage(), null=True, blank=True
    )
    zielgruppe = models.CharField(
        max_length=10, choices=Zielgruppe.choices, default=Zielgruppe.MITGLIEDER
    )
    anonym = models.BooleanField(default=True)
    ergebnis_modus = models.CharField(
        max_length=12, choices=ErgebnisModus.choices, default=ErgebnisModus.NACH_FRIST
    )
    frist = models.DateTimeField()
    veroeffentlicht = models.BooleanField(default=False)
    publikation = models.ForeignKey(
        "communaute.Publication",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="umfragen",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="umfragen_erstellt"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "umfragen_umfragen"
        ordering = ["-created_at"]

    def __str__(self):
        return self.titel

    @property
    def abgelaufen(self) -> bool:
        return self.frist <= timezone.now()


class UmfrageFrage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    umfrage = models.ForeignKey(Umfrage, on_delete=models.CASCADE, related_name="fragen")
    text = models.CharField(max_length=500)
    typ = models.CharField(max_length=10, choices=FrageTyp.choices, default=FrageTyp.EINZEL)
    pflicht = models.BooleanField(default=True)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "umfragen_fragen"
        ordering = ["ordre", "id"]

    def __str__(self):
        return self.text


class UmfrageOption(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    frage = models.ForeignKey(UmfrageFrage, on_delete=models.CASCADE, related_name="optionen")
    text = models.CharField(max_length=255)
    ordre = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "umfragen_optionen"
        ordering = ["ordre", "id"]

    def __str__(self):
        return self.text


class UmfrageTeilnahme(models.Model):
    """Wer teilgenommen hat (Schutz vor Doppelteilnahme) — OHNE Verknüpfung zu den Antworten."""

    umfrage = models.ForeignKey(Umfrage, on_delete=models.CASCADE, related_name="teilnahmen")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="umfrage_teilnahmen"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "umfragen_teilnahmen"
        constraints = [
            models.UniqueConstraint(fields=["umfrage", "user"], name="uniq_umfrage_teilnahme")
        ]


class UmfrageEinreichung(models.Model):
    """Ein abgegebener Fragebogen. `user` ist bei anonymen Umfragen immer leer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    umfrage = models.ForeignKey(Umfrage, on_delete=models.CASCADE, related_name="einreichungen")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="umfrage_einreichungen",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "umfragen_einreichungen"
        ordering = ["created_at"]


class UmfrageAntwort(models.Model):
    einreichung = models.ForeignKey(
        UmfrageEinreichung, on_delete=models.CASCADE, related_name="antworten"
    )
    frage = models.ForeignKey(UmfrageFrage, on_delete=models.CASCADE, related_name="antworten")
    option = models.ForeignKey(
        UmfrageOption, on_delete=models.CASCADE, null=True, blank=True, related_name="antworten"
    )
    freitext = models.TextField(blank=True)

    class Meta:
        db_table = "umfragen_antworten"

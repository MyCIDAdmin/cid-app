"""Büro- und Vereinskalender (Release 15, Entscheidungen von Ghazi 2026-10-13).

- Eigene Termine (`Termin`) mit Sichtbarkeit : Kreis (Bureau oder Projektteam), alle
  Aufgabenträger, alle Mitglieder (Vereinskalender) oder öffentlich ohne Anmeldung.
- Zusätzlich liefert `feed.py` schreibgeschützte Einträge aus Veranstaltungen, Aufgaben-Fristen,
  Umfragen, Abstimmungen und Spieltagen — dort nichts doppelt pflegen.
- Terminvorschläge dürfen nur Personen mit der Seite `page_kalender_vorschlag` einreichen (vom
  App-Admin über die Rollenverwaltung vergeben) ; das Bureau gibt sie frei oder lehnt ab.
"""

import uuid

from django.conf import settings
from django.db import models


class Kategorie(models.TextChoices):
    SITZUNG = "sitzung", "Sitzung"
    VERANSTALTUNG = "veranstaltung", "Veranstaltung"
    FRIST = "frist", "Frist"
    PROJEKT = "projekt", "Projekt"
    SPIELTAG = "spieltag", "Spieltag"
    ABWESENHEIT = "abwesenheit", "Abwesenheit"
    DIENST = "dienst", "Dienst"
    VEREINSDATUM = "vereinsdatum", "Wichtiges Vereinsdatum"
    SONSTIGES = "sonstiges", "Sonstiges"


class Sichtbarkeit(models.TextChoices):
    KREIS = "kreis", "Nur ein Kreis (Bureau oder Projektteam)"
    AUFGABENTRAEGER = "aufgabentraeger", "Alle Aufgabenträger"
    MITGLIEDER = "mitglieder", "Alle Mitglieder (Vereinskalender)"
    OEFFENTLICH = "oeffentlich", "Öffentlich (ohne Anmeldung)"


class Kreis(models.TextChoices):
    BUREAU = "bureau", "Bureau"
    PROJEKT = "projekt", "Projektteam"


class Wiederholung(models.TextChoices):
    KEINE = "keine", "Keine"
    WOECHENTLICH = "woechentlich", "Wöchentlich"
    ZWEIWOECHENTLICH = "zweiwoechentlich", "Alle zwei Wochen"
    MONATLICH = "monatlich", "Monatlich"


class TerminStatus(models.TextChoices):
    VORGESCHLAGEN = "vorgeschlagen", "Vorgeschlagen"
    FREIGEGEBEN = "freigegeben", "Freigegeben"
    ABGELEHNT = "abgelehnt", "Abgelehnt"


class Antwort(models.TextChoices):
    AUSSTEHEND = "ausstehend", "Ausstehend"
    ZUSAGE = "zusage", "Zusage"
    VIELLEICHT = "vielleicht", "Vielleicht"
    ABSAGE = "absage", "Absage"


class Termin(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    titel = models.CharField(max_length=200)
    beschreibung = models.TextField(blank=True)
    ort = models.CharField(max_length=255, blank=True)
    link = models.URLField(max_length=500, blank=True)
    kategorie = models.CharField(
        max_length=20, choices=Kategorie.choices, default=Kategorie.SONSTIGES
    )
    beginn = models.DateTimeField()
    ende = models.DateTimeField(null=True, blank=True)
    ganztaegig = models.BooleanField(default=False)
    sichtbarkeit = models.CharField(
        max_length=20, choices=Sichtbarkeit.choices, default=Sichtbarkeit.KREIS
    )
    kreis = models.CharField(max_length=10, choices=Kreis.choices, blank=True)
    projekt = models.ForeignKey(
        "projets.Projet", on_delete=models.CASCADE, null=True, blank=True, related_name="termine"
    )
    wichtig = models.BooleanField(default=False)
    wiederholung = models.CharField(
        max_length=20, choices=Wiederholung.choices, default=Wiederholung.KEINE
    )
    wiederholung_bis = models.DateField(null=True, blank=True)
    erinnerung_stunden = models.PositiveSmallIntegerField(null=True, blank=True)
    letzte_erinnerung = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=15, choices=TerminStatus.choices, default=TerminStatus.FREIGEGEBEN
    )
    publikation = models.ForeignKey(
        "communaute.Publication",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="kalender_termine",
    )
    erstellt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="kalender_termine"
    )
    freigegeben_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "kalender_termine"
        ordering = ["beginn"]
        indexes = [models.Index(fields=["status", "beginn"], name="kalender_status_beginn_idx")]

    def __str__(self):
        return self.titel


class TerminEinladung(models.Model):
    termin = models.ForeignKey(Termin, on_delete=models.CASCADE, related_name="einladungen")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="kalender_einladungen"
    )
    antwort = models.CharField(max_length=12, choices=Antwort.choices, default=Antwort.AUSSTEHEND)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "kalender_einladungen"
        constraints = [
            models.UniqueConstraint(fields=["termin", "user"], name="uniq_kalender_einladung")
        ]

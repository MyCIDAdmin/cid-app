"""Support (Release 33) — Häufige Fragen (FAQ) und Tickets an das Büro."""

from django.conf import settings
from django.db import models


class TicketKategorie(models.TextChoices):
    KONTO = "konto", "Konto und Anmeldung"
    MITGLIEDSCHAFT = "mitgliedschaft", "Mitgliedschaft"
    ZAHLUNG = "zahlung", "Zahlung und Beitrag"
    VERANSTALTUNG = "veranstaltung", "Veranstaltungen und Regionen"
    TECHNIK = "technik", "Technik und Fehler"
    SONSTIGES = "sonstiges", "Sonstiges"


class TicketStatus(models.TextChoices):
    OFFEN = "offen", "Offen"
    IN_BEARBEITUNG = "in_bearbeitung", "In Bearbeitung"
    WARTET = "wartet_auf_antwort", "Wartet auf Antwort"
    GELOEST = "geloest", "Gelöst"
    GESCHLOSSEN = "geschlossen", "Geschlossen"


# Stati, in denen ein Ticket noch Aufmerksamkeit braucht.
AKTIVE_STATI = [TicketStatus.OFFEN, TicketStatus.IN_BEARBEITUNG, TicketStatus.WARTET]


class Ticket(models.Model):
    """Eine Anfrage an das Büro. Die Ticketnummer ist die `id`. Das Konto darf später gelöscht
    werden (`SET_NULL`) ; Name und Art bleiben als Momentaufnahme für das Büro erhalten."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_tickets",
    )
    name = models.CharField(max_length=200, blank=True)
    betreff = models.CharField(max_length=150)
    kategorie = models.CharField(
        max_length=20, choices=TicketKategorie.choices, default=TicketKategorie.SONSTIGES
    )
    status = models.CharField(
        max_length=20, choices=TicketStatus.choices, default=TicketStatus.OFFEN, db_index=True
    )
    bearbeiter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="support_tickets_bearbeitet",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    geschlossen_am = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"#{self.pk} {self.betreff}"


class TicketNachricht(models.Model):
    """Eine Nachricht im Ticket. `intern` = Notiz nur für das Büro (nie für die Person sichtbar)."""

    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="nachrichten")
    autor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    von_support = models.BooleanField(default=False)
    intern = models.BooleanField(default=False)
    text = models.TextField(max_length=2000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class FaqEintrag(models.Model):
    """Häufige Frage, vom Büro in der App gepflegt (Deutsch ; Französisch optional)."""

    frage_de = models.CharField(max_length=200)
    frage_fr = models.CharField(max_length=200, blank=True)
    antwort_de = models.TextField(max_length=3000)
    antwort_fr = models.TextField(max_length=3000, blank=True)
    kategorie = models.CharField(
        max_length=20, choices=TicketKategorie.choices, default=TicketKategorie.SONSTIGES
    )
    reihenfolge = models.PositiveIntegerField(default=100)
    aktiv = models.BooleanField(default=True)

    class Meta:
        ordering = ["reihenfolge", "id"]

    def __str__(self):
        return self.frage_de

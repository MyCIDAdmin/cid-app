"""Eintrittsticket : genau eines je bestätigter Anmeldung (Veranstaltung) bzw. Teilnahme (Treffen).

Der QR-Code enthält nur den zufälligen `code`, keine Personendaten. Wie viele Personen das Ticket
umfasst, steht nicht im Ticket, sondern wird bei jedem Zugriff aus der Anmeldung berechnet
(Begleitpersonen können sich bis zur Veranstaltung ändern).
"""

import secrets
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


def neuer_code() -> str:
    """Zufälliger, nicht erratbarer Code (144 Bit)."""
    return secrets.token_urlsafe(18)


class Eintrittsticket(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inscription = models.OneToOneField(
        "evenements.Inscription",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ticket",
    )
    teilnahme = models.OneToOneField(
        "regionen.Teilnahme",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ticket",
    )
    code = models.CharField(max_length=40, unique=True, default=neuer_code)
    gueltig = models.BooleanField(
        default=True, help_text="False bei Storno, Absage oder wenn die Anmeldung nicht mehr gilt."
    )
    versendet_am = models.DateTimeField(null=True, blank=True)
    erneuert_am = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "eintritt_tickets"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(inscription__isnull=False, teilnahme__isnull=True)
                    | Q(inscription__isnull=True, teilnahme__isnull=False)
                ),
                name="eintritt_ticket_genau_eine_quelle",
            )
        ]

    def __str__(self):
        return f"Ticket {self.pk}"


class Einlass(models.Model):
    """Ein Eintrag der Anwesenheit : so viele Personen einer Anmeldung bzw. Teilnahme sind jetzt
    da. Entsteht beim Scan eines Tickets (dann ist `ticket` gesetzt) oder von Hand aus der Liste
    (auch bei Veranstaltungen ohne Tickets).

    Anwesende Personen = Summe der nicht zurückgenommenen Einträge. Eine Gruppe kann also in
    mehreren Schritten eintreffen (Teil-Einlass mit demselben Code).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(
        Eintrittsticket, null=True, blank=True, on_delete=models.SET_NULL, related_name="einlaesse"
    )
    inscription = models.ForeignKey(
        "evenements.Inscription",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="einlaesse",
    )
    teilnahme = models.ForeignKey(
        "regionen.Teilnahme",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="einlaesse",
    )
    geprueft_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    erwachsene = models.PositiveSmallIntegerField(default=0)
    kinder = models.PositiveSmallIntegerField(default=0)
    zeit = models.DateTimeField(auto_now_add=True)
    zurueckgenommen = models.BooleanField(default=False)
    zurueckgenommen_am = models.DateTimeField(null=True, blank=True)
    zurueckgenommen_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "eintritt_einlaesse"
        ordering = ["zeit"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(inscription__isnull=False, teilnahme__isnull=True)
                    | Q(inscription__isnull=True, teilnahme__isnull=False)
                ),
                name="eintritt_einlass_genau_eine_quelle",
            )
        ]


class EinlassHelfer(models.Model):
    """Vom Büro bzw. von den Verantwortlichen für genau eine Veranstaltung benannte Person, die
    am Einlass scannen darf (nur am Veranstaltungstag, sieht nur Name, Personenzahl und Status)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    evenement = models.ForeignKey(
        "evenements.Evenement",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="einlass_helfer",
    )
    veranstaltung = models.ForeignKey(
        "regionen.Veranstaltung",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="einlass_helfer",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="einlass_helfer"
    )
    benannt_von = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "eintritt_einlass_helfer"
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(evenement__isnull=False, veranstaltung__isnull=True)
                    | Q(evenement__isnull=True, veranstaltung__isnull=False)
                ),
                name="eintritt_helfer_genau_ein_ziel",
            ),
            models.UniqueConstraint(
                fields=["evenement", "user"],
                condition=Q(evenement__isnull=False),
                name="eintritt_helfer_ev_eindeutig",
            ),
            models.UniqueConstraint(
                fields=["veranstaltung", "user"],
                condition=Q(veranstaltung__isnull=False),
                name="eintritt_helfer_ver_eindeutig",
            ),
        ]

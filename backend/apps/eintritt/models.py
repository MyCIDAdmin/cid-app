"""Eintrittsticket : genau eines je bestätigter Anmeldung (Veranstaltung) bzw. Teilnahme (Treffen).

Der QR-Code enthält nur den zufälligen `code`, keine Personendaten. Wie viele Personen das Ticket
umfasst, steht nicht im Ticket, sondern wird bei jedem Zugriff aus der Anmeldung berechnet
(Begleitpersonen können sich bis zur Veranstaltung ändern).
"""

import secrets
import uuid

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

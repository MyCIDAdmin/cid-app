"""Celery-Aufgaben der App wahlen."""

from celery import shared_task
from django.utils import timezone

from . import mitteilungen, services
from .models import Bekanntmachung, BekanntmachungStatus


@shared_task
def bekanntmachungen_senden() -> int:
    """Alle 10 Minuten: freigegebene Bekanntmachungen, deren Zeitpunkt erreicht ist, versenden."""
    anzahl = 0
    faellig = Bekanntmachung.objects.filter(
        status=BekanntmachungStatus.FREIGEGEBEN, versand_am__lte=timezone.now()
    )
    for bk in faellig:
        anzahl += services.bekanntmachung_senden(bk)
    return anzahl


@shared_task
def nachweise_loeschen() -> int:
    """Täglich: Nachweise nach der vom Ausschuss gewählten Aufbewahrungsfrist löschen."""
    return services.nachweise_loeschen()


@shared_task
def mitteilungen_senden() -> dict:
    """Alle 10 Minuten: Plan der Erinnerungen nachziehen und Fälliges versenden."""
    return mitteilungen.faellige_senden()

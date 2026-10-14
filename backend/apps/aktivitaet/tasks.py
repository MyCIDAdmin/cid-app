from celery import shared_task

from apps.accounts.services import log_audit_event

from .alarm import lauf
from .services import bereinigen


@shared_task
def aktivitaet_bereinigen() -> dict:
    """Täglich : Aufbewahrungsfristen des Aktivitäts-Protokolls anwenden."""
    ergebnis = bereinigen()
    if ergebnis["geloescht"] or ergebnis["ip_entfernt"]:
        log_audit_event("aktivitaet_bereinigt", **ergebnis)
    return ergebnis


@shared_task
def auffaelligkeiten_pruefen() -> dict:
    """Alle 10 Minuten : Auffälligkeitsregeln prüfen und App-Admins bei neuen Funden melden."""
    return lauf()

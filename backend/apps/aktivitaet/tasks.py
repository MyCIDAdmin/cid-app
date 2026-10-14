from celery import shared_task

from apps.accounts.services import log_audit_event

from .services import bereinigen


@shared_task
def aktivitaet_bereinigen() -> dict:
    """Täglich : Aufbewahrungsfristen des Aktivitäts-Protokolls anwenden."""
    ergebnis = bereinigen()
    if ergebnis["geloescht"] or ergebnis["ip_entfernt"]:
        log_audit_event("aktivitaet_bereinigt", **ergebnis)
    return ergebnis

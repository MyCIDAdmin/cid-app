"""Tâches Celery — app projets. `erinnere_aufgaben_faellig` est planifiée par Celery Beat une
fois par jour à 8h00 (voir la migration 0004_planifier_erinnerung_fristen, même principe que
apps.cotisations 0003)."""

from datetime import date, timedelta

from celery import shared_task
from django.utils import timezone

from .models import Aufgabe, StatutAufgabe
from .notifications import notifier_aufgabe_faellig


@shared_task
def erinnere_aufgaben_faellig(today: date | None = None) -> int:
    """Rappelle aux responsables les tâches non terminées dues aujourd'hui ou demain. Chaque
    échéance ne correspond qu'à un seul jour d'exécution par tâche et par type : pas de doublon."""
    today = today or timezone.localdate()
    morgen = today + timedelta(days=1)
    anzahl = 0
    aufgaben = (
        Aufgabe.objects.filter(frist__in=[today, morgen], verantwortlich__isnull=False)
        .exclude(status=StatutAufgabe.ERLEDIGT)
        .select_related("projet", "verantwortlich__user")
    )
    for aufgabe in aufgaben:
        notifier_aufgabe_faellig(aufgabe, heute=aufgabe.frist == today)
        anzahl += 1
    return anzahl

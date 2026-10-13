"""Erinnerungen an Termine (alle 30 Minuten per Celery Beat)."""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Antwort, Dienst, Kreis, Termin, TerminStatus
from .services import naechster_start, team_nutzer


@shared_task
def termin_erinnerungen() -> int:
    """Benachrichtigt Eingeladene (außer Absagen) und Ersteller `erinnerung_stunden` vor dem
    nächsten Beginn — je Vorkommen genau einmal. Gibt die Zahl der Termine zurück."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    jetzt = timezone.now()
    anzahl = 0
    kandidaten = Termin.objects.filter(
        status=TerminStatus.FREIGEGEBEN, erinnerung_stunden__isnull=False
    ).select_related("erstellt_von")
    for t in kandidaten:
        start = naechster_start(t, jetzt)
        if start is None or start - timedelta(hours=t.erinnerung_stunden) > jetzt:
            continue
        if t.letzte_erinnerung and t.letzte_erinnerung >= start - timedelta(
            hours=t.erinnerung_stunden
        ):
            continue
        empfaenger = {t.erstellt_von}
        for e in t.einladungen.exclude(antwort=Antwort.ABSAGE).select_related("user"):
            empfaenger.add(e.user)
        if t.kreis == Kreis.EVENT_TEAM:
            empfaenger |= team_nutzer(t)
        zeit = timezone.localtime(start).strftime("%d.%m.%Y %H:%M")
        for user in empfaenger:
            notifier(
                user,
                TypeNotification.EVENEMENT_RAPPEL,
                titre=f"Erinnerung: {t.titel}",
                message=f"{t.titel} beginnt am {zeit}.",
                lien="/kalender",
            )
        t.letzte_erinnerung = jetzt
        t.save(update_fields=["letzte_erinnerung"])
        anzahl += 1
    return anzahl + _dienst_erinnerungen(jetzt)


def _dienst_erinnerungen(jetzt) -> int:
    """Erinnerung an eingetragene Helfer `erinnerung_stunden` vor dem Dienst (einmalig)."""
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    anzahl = 0
    for d in Dienst.objects.filter(
        erinnerung_stunden__isnull=False, letzte_erinnerung__isnull=True, beginn__gt=jetzt
    ):
        if d.beginn - timedelta(hours=d.erinnerung_stunden) > jetzt:
            continue
        zeit = timezone.localtime(d.beginn).strftime("%d.%m.%Y %H:%M")
        for e in d.eintraege.select_related("user"):
            notifier(
                e.user,
                TypeNotification.EVENEMENT_RAPPEL,
                titre=f"Dienst: {d.titel}",
                message=f"Dein Dienst „{d.titel}“ beginnt am {zeit}.",
                lien="/kalender",
            )
        d.letzte_erinnerung = jetzt
        d.save(update_fields=["letzte_erinnerung"])
        anzahl += 1
    return anzahl

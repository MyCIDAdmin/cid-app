from celery import shared_task

from apps.accounts.services import log_audit_event

from . import bericht, pflege, review
from .alarm import lauf
from .services import bereinigen


@shared_task
def aktivitaet_bereinigen() -> dict:
    """Täglich : Datenpflege anwenden (Fristen des Protokolls und der Hilfsdaten), sofern die
    automatische Pflege eingeschaltet ist."""
    if not pflege.einstellung().automatisch:
        return {"geloescht": 0, "ip_entfernt": 0}
    ergebnis = bereinigen()
    if ergebnis["geloescht"] or ergebnis["ip_entfernt"]:
        log_audit_event("aktivitaet_bereinigt", **ergebnis)
    return ergebnis


@shared_task
def auffaelligkeiten_pruefen() -> dict:
    """Alle 10 Minuten : Auffälligkeitsregeln prüfen und App-Admins bei neuen Funden melden."""
    return lauf()


@shared_task
def monatsbericht_senden() -> dict:
    """Am 1. jedes Monats : Bericht des Vormonats erstellen und an die App-Admins senden."""
    jahr, monat = bericht.vormonat()
    b = bericht.erstellen(jahr, monat)
    log_audit_event("monatsbericht_erstellt", jahr=jahr, monat=monat)
    empfaenger = bericht.senden(b)
    log_audit_event("monatsbericht_gesendet", jahr=jahr, monat=monat, empfaenger=empfaenger)
    return {"jahr": jahr, "monat": monat, "empfaenger": empfaenger}


@shared_task
def rechte_review_anlegen() -> dict:
    """Am 1. jedes Quartals : Rechteprüfung anlegen und die App-Admins informieren."""
    r, neu = review.anlegen()
    if not neu:
        return {"quartal": r.quartal, "neu": False}
    log_audit_event("rechte_review_angelegt", quartal=r.quartal, konten=r.positionen.count())
    return {"quartal": r.quartal, "neu": True, "empfaenger": review.melden(r)}

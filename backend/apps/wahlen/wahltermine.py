"""Live-Termine zur Wahl (Vorstellungsrunde, Fragestunde) mit Erinnerung.

* Ausschuss und Büro legen Termine an. Sie erscheinen im Überblick der Wahl.
* Sobald die Wahl veröffentlicht ist, spiegelt der Termin sich in den Vereinskalender
  (`kalender.Termin`, sichtbar für alle Mitglieder, Erinnerung 1 Stunde vorher an alle mit Zusage).
* „Erinnere mich“ ist eine Zusage (`TerminEinladung`) im Kalender: Zu- und Absage dort und hier
  bleiben dadurch dasselbe.
* Alle Mitglieder bekommen 1 Tag vorher eine Mitteilung (Plan in `mitteilungen.planen`).
"""

from __future__ import annotations

from datetime import timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from . import services
from .models import Wahl, WahlStatus, WahlTermin, WahlTerminArt

MAX_PRO_WAHL = 12
ERINNERUNG_STUNDEN = 1


def _pruefen(wahl: Wahl, daten: dict, *, neu: bool) -> dict:
    """Prüft und bereinigt die Eingabe; gibt die Felder zum Speichern zurück."""
    if wahl.status == WahlStatus.ABGESCHLOSSEN:
        raise ValidationError({"wahl": "Die Wahl ist abgeschlossen."})
    fehler: dict[str, str] = {}
    felder: dict = {}
    if neu or "art" in daten:
        if daten.get("art") not in WahlTerminArt.values:
            fehler["art"] = "Unbekannte Art."
        else:
            felder["art"] = daten["art"]
    if neu or "titel" in daten:
        titel = str(daten.get("titel", "")).strip()[:200]
        if not titel:
            fehler["titel"] = "Bitte einen Titel angeben."
        felder["titel"] = titel
    if neu or "beginn" in daten:
        beginn = _zeit(daten.get("beginn"))
        if beginn is None:
            fehler["beginn"] = "Bitte Datum und Uhrzeit angeben."
        else:
            if beginn <= timezone.now():
                fehler["beginn"] = "Der Termin muss in der Zukunft liegen."
            elif beginn > wahl.wahl_bis:
                fehler["beginn"] = "Der Termin muss vor dem Ende der Wahl liegen."
            felder["beginn"] = beginn
    if "ende" in daten:
        ende = _zeit(daten.get("ende")) if daten.get("ende") else None
        felder["ende"] = ende
    if "link" in daten:
        link = str(daten.get("link") or "").strip()
        if link:
            try:
                URLValidator(schemes=["https", "http"])(link)
            except DjangoValidationError:
                fehler["link"] = "Bitte einen gültigen Link (https://…) angeben."
        felder["link"] = link
    if "hinweis" in daten:
        felder["hinweis"] = str(daten.get("hinweis") or "").strip()[:300]
    beginn = felder.get("beginn")
    ende = felder.get("ende")
    if beginn and ende and ende <= beginn:
        fehler["ende"] = "Das Ende muss nach dem Beginn liegen."
    if fehler:
        raise ValidationError(fehler)
    return felder


def _zeit(wert):
    from django.utils.dateparse import parse_datetime

    if wert in (None, ""):
        return None
    z = wert if hasattr(wert, "tzinfo") else parse_datetime(str(wert))
    if z is None:
        return None
    return timezone.make_aware(z) if timezone.is_naive(z) else z


def _nur_intern(user, wahl: Wahl) -> None:
    if not services.ausschuss_oder_verwaltung(user, wahl):
        raise PermissionDenied("Nur Wahlausschuss und Büro.")


@transaction.atomic
def anlegen(user, wahl: Wahl, daten: dict) -> WahlTermin:
    _nur_intern(user, wahl)
    if wahl.live_termine.count() >= MAX_PRO_WAHL:
        raise ValidationError({"wahl": f"Höchstens {MAX_PRO_WAHL} Termine je Wahl."})
    wt = WahlTermin.objects.create(wahl=wahl, created_by=user, **_pruefen(wahl, daten, neu=True))
    spiegeln(wt)
    return wt


@transaction.atomic
def aendern(user, wt: WahlTermin, daten: dict) -> WahlTermin:
    _nur_intern(user, wt.wahl)
    for feld, wert in _pruefen(wt.wahl, daten, neu=False).items():
        setattr(wt, feld, wert)
    wt.save()
    spiegeln(wt)
    return wt


def loeschen(user, wt: WahlTermin) -> None:
    _nur_intern(user, wt.wahl)
    wt.delete()


def spiegeln(wt: WahlTermin) -> None:
    """Legt den Eintrag im Vereinskalender an oder zieht ihn nach. Solange die Wahl ein Entwurf
    ist, gibt es keinen Kalendereintrag (Mitglieder sollen noch nichts sehen)."""
    from apps.kalender.models import Kategorie, Sichtbarkeit, Termin, TerminStatus

    if wt.wahl.status == WahlStatus.ENTWURF:
        return
    felder = {
        "titel": wt.titel,
        "beschreibung": wt.hinweis,
        "ort": "Video" if wt.link else "",
        "link": wt.link,
        "kategorie": Kategorie.VEREINSDATUM,
        "beginn": wt.beginn,
        "ende": wt.ende,
        "sichtbarkeit": Sichtbarkeit.MITGLIEDER,
        "wichtig": True,
        "erinnerung_stunden": ERINNERUNG_STUNDEN,
        "status": TerminStatus.FREIGEGEBEN,
    }
    if wt.termin_id is None:
        wt.termin = Termin.objects.create(
            erstellt_von=wt.created_by, freigegeben_von=wt.created_by, **felder
        )
        wt.save(update_fields=["termin"])
        return
    t = wt.termin
    verschoben = t.beginn != wt.beginn
    for feld, wert in felder.items():
        setattr(t, feld, wert)
    if verschoben:
        t.letzte_erinnerung = None  # die Erinnerung gilt für den neuen Zeitpunkt
    t.save()


def wahl_veroeffentlicht(wahl: Wahl) -> None:
    """Nach dem Veröffentlichen der Wahl: alle bis dahin angelegten Termine in den Kalender."""
    for wt in wahl.live_termine.all():
        spiegeln(wt)


def erinnern(user, wt: WahlTermin, an: bool) -> bool:
    """„Erinnere mich“ ein- oder ausschalten (Zusage im Kalender). Gibt den neuen Stand zurück."""
    from apps.kalender.models import Antwort, TerminEinladung

    intern = services.ausschuss_oder_verwaltung(user, wt.wahl)
    if wt.wahl.status == WahlStatus.ENTWURF and not intern:
        raise PermissionDenied("Kein Zugriff auf diese Wahl.")
    if wt.termin_id is None:
        raise ValidationError({"termin": "Die Wahl ist noch nicht veröffentlicht."})
    if wt.beginn <= timezone.now():
        raise ValidationError({"termin": "Der Termin hat schon begonnen."})
    if an:
        TerminEinladung.objects.update_or_create(
            termin_id=wt.termin_id, user=user, defaults={"antwort": Antwort.ZUSAGE}
        )
    else:
        TerminEinladung.objects.filter(termin_id=wt.termin_id, user=user).delete()
    return an


def termin_dict(wt: WahlTermin, user) -> dict:
    from apps.kalender.models import Antwort, TerminEinladung

    erinnert = bool(
        wt.termin_id
        and TerminEinladung.objects.filter(
            termin_id=wt.termin_id, user=user, antwort=Antwort.ZUSAGE
        ).exists()
    )
    return {
        "id": str(wt.id),
        "wahl": str(wt.wahl_id),
        "art": wt.art,
        "titel": wt.titel,
        "beginn": wt.beginn,
        "ende": wt.ende,
        "link": wt.link,
        "hinweis": wt.hinweis,
        "im_kalender": wt.termin_id is not None,
        "erinnert": erinnert,
        "vorbei": wt.beginn <= timezone.now() + timedelta(0),
    }

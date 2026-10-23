"""Ticket-Logik : erzeugen, ungültig machen, erneuern, Anzeigedaten und QR-Bild.

Ein Ticket entsteht, sobald die Veranstaltung `ticket_aktiv` hat und die Anmeldung bestätigt ist
(bei Bezahlveranstaltungen also nach Zahlungseingang, bei Warteliste nach dem Nachrücken). Bei
Storno oder Absage wird es ungültig, bei erneuter Bestätigung wieder gültig und neu versendet.
"""

from __future__ import annotations

import base64
import io

import qrcode
from django.db import transaction
from django.utils import timezone

from apps.evenements.models import Evenement, Inscription, StatutEvenement, StatutInscription
from apps.regionen.models import Teilnahme, Veranstaltung, VeranstaltungStatus

from .models import Eintrittsticket, neuer_code

#: Inhalt des QR-Codes : Präfix + Code (das Präfix erkennt der Scanner später als CID-Ticket).
QR_PRAEFIX = "CID-T:"


# ---------------------------------------------------------------------------------------------
# Anzeigedaten
# ---------------------------------------------------------------------------------------------


def inhaber(ticket: Eintrittsticket):
    """Konto der Person, der das Ticket gehört (kann bei Mitgliedern ohne Konto None sein)."""
    if ticket.inscription_id:
        return ticket.inscription.membre.user
    return ticket.teilnahme.user


def _name_von_user(user) -> str:
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}".strip()
    fan = getattr(user, "fan_profil", None)
    if fan is not None:
        return f"{fan.prenom} {fan.nom}".strip()
    return ""


def anzeige(ticket: Eintrittsticket) -> dict:
    """Alles, was Anzeige, PDF und Mail über das Ticket wissen müssen (ohne Code)."""
    if ticket.inscription_id:
        ins = ticket.inscription
        ev = ins.evenement
        return {
            "art": "veranstaltung",
            "titel": ev.titre,
            "datum": ev.date_evenement,
            "uhrzeit": ev.heure,
            "ort": ev.lieu,
            "erwachsene": ins.places + ins.nombre_accompagnants_adultes,
            "kinder": ins.nombre_accompagnants_enfants,
            "name": f"{ins.membre.prenom} {ins.membre.nom}".strip(),
            "lien": f"/tickets?ticket={ticket.pk}",
        }
    tn = ticket.teilnahme
    v = tn.veranstaltung
    return {
        "art": "treffen",
        "titel": v.titel,
        "datum": v.datum,
        "uhrzeit": v.uhrzeit,
        "ort": v.ort,
        "erwachsene": 1,
        "kinder": 0,
        "name": _name_von_user(tn.user),
        "lien": f"/tickets?ticket={ticket.pk}",
    }


def qr_inhalt(ticket: Eintrittsticket) -> str:
    return f"{QR_PRAEFIX}{ticket.code}"


def qr_png(ticket: Eintrittsticket) -> bytes:
    bild = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=3)
    bild.add_data(qr_inhalt(ticket))
    bild.make(fit=True)
    puffer = io.BytesIO()
    bild.make_image(fill_color="black", back_color="white").save(puffer, format="PNG")
    return puffer.getvalue()


def qr_data_url(ticket: Eintrittsticket) -> str:
    return "data:image/png;base64," + base64.b64encode(qr_png(ticket)).decode()


# ---------------------------------------------------------------------------------------------
# Erzeugen und ungültig machen
# ---------------------------------------------------------------------------------------------


def _versand_planen(ticket: Eintrittsticket) -> None:
    from . import tasks

    transaction.on_commit(lambda: tasks.ticket_senden.delay(str(ticket.pk)))


def _sicherstellen(*, aktiv: bool, gueltig_status: bool, **quelle) -> Eintrittsticket | None:
    """Gemeinsame Logik : Ticket anlegen/aktivieren, wenn `aktiv` und `gueltig_status`, sonst
    ein vorhandenes ungültig machen. Neu oder wieder gültig → Versand."""
    ticket = Eintrittsticket.objects.filter(**quelle).first()
    if aktiv and gueltig_status:
        if ticket is None:
            ticket = Eintrittsticket.objects.create(**quelle)
            _versand_planen(ticket)
        elif not ticket.gueltig:
            ticket.gueltig = True
            ticket.versendet_am = None
            ticket.save(update_fields=["gueltig", "versendet_am", "updated_at"])
            _versand_planen(ticket)
        return ticket
    if ticket is not None and ticket.gueltig:
        ticket.gueltig = False
        ticket.save(update_fields=["gueltig", "updated_at"])
    return ticket


def inscription_pruefen(inscription: Inscription) -> Eintrittsticket | None:
    ev = inscription.evenement
    return _sicherstellen(
        aktiv=ev.ticket_aktiv and ev.statut != StatutEvenement.ANNULE,
        gueltig_status=inscription.statut == StatutInscription.CONFIRMEE,
        inscription=inscription,
    )


def teilnahme_pruefen(teilnahme: Teilnahme) -> Eintrittsticket | None:
    v = teilnahme.veranstaltung
    return _sicherstellen(
        aktiv=v.ticket_aktiv,
        gueltig_status=v.status
        in {VeranstaltungStatus.VEROEFFENTLICHT, VeranstaltungStatus.ABGESCHLOSSEN},
        teilnahme=teilnahme,
    )


def evenement_pruefen(evenement: Evenement) -> None:
    """Nach Änderung der Veranstaltung (Schalter, Absage) alle Anmeldungen abgleichen."""
    if (
        not evenement.ticket_aktiv
        and not Eintrittsticket.objects.filter(inscription__evenement=evenement).exists()
    ):
        return
    for inscription in evenement.inscriptions.select_related("evenement", "membre__user"):
        inscription_pruefen(inscription)


def veranstaltung_pruefen(veranstaltung: Veranstaltung) -> None:
    """Dasselbe für ein regionales Treffen (Schalter, Veröffentlichung, Absage)."""
    if (
        not veranstaltung.ticket_aktiv
        and not Eintrittsticket.objects.filter(teilnahme__veranstaltung=veranstaltung).exists()
    ):
        return
    for teilnahme in veranstaltung.teilnahmen.select_related("veranstaltung", "user"):
        teilnahme_pruefen(teilnahme)


def erneuern(ticket: Eintrittsticket) -> Eintrittsticket:
    """Neuer Code, der alte wird ungültig (z. B. wenn das Bild weitergegeben wurde)."""
    ticket.code = neuer_code()
    ticket.erneuert_am = timezone.now()
    ticket.versendet_am = None
    ticket.save(update_fields=["code", "erneuert_am", "versendet_am", "updated_at"])
    _versand_planen(ticket)
    return ticket

"""Tägliche Erinnerungen (Celery Beat, 9:00 — siehe Migration 0003) :

- Vertragsende : Dokumente vom Typ "Vertrag" mit `gueltig_bis` in höchstens 60 bzw. 14 Tagen ;
  je Schwelle genau eine Erinnerung (Flags `erinnert_60`/`erinnert_14`).
- Bewertung : ein Tag nach Ende einer Veranstaltung bzw. eines Projekts (abgeschlossen oder
  Frist überschritten) für jeden verknüpften Partner, der dafür noch nicht bewertet wurde ; nur
  innerhalb von 14 Tagen nach Ende, damit beim Start keine Altfälle auf einmal erinnern.

Empfänger : Ersteller des Dokuments bzw. der Verknüpfung plus alle aktiven Bureau Admins und
höher (Nutzerentscheidung 2026-10-07). Nur In-App-Benachrichtigungen, keine E-Mails.
"""

from datetime import date, timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.accounts.models import ROLE_LEVELS, Role
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import DokumentTyp, PartnerStatus, PartnerVerknuepfung

RUECKSCHAU_TAGE = 14


def _verwalter():
    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    rollen = [rolle for rolle, niveau in ROLE_LEVELS.items() if niveau >= stufe]
    return list(get_user_model().objects.filter(is_active=True, role__in=rollen))


def _empfaenger(ersteller):
    nutzer = {u.pk: u for u in _verwalter()}
    if ersteller is not None and ersteller.is_active:
        nutzer[ersteller.pk] = ersteller
    return list(nutzer.values())


def _vertragsende(heute: date) -> int:
    from .models import PartnerDokument

    anzahl = 0
    dokumente = (
        PartnerDokument.objects.filter(
            typ=DokumentTyp.VERTRAG,
            gueltig_bis__isnull=False,
            gueltig_bis__gte=heute,
            gueltig_bis__lte=heute + timedelta(days=60),
        )
        .exclude(partner__statut=PartnerStatus.ARCHIVIERT)
        .select_related("partner", "hochgeladen_von")
    )
    for dok in dokumente:
        tage = (dok.gueltig_bis - heute).days
        if tage <= 14 and not dok.erinnert_14:
            dok.erinnert_14 = dok.erinnert_60 = True
        elif tage > 14 and not dok.erinnert_60:
            dok.erinnert_60 = True
        else:
            continue
        dok.save(update_fields=["erinnert_14", "erinnert_60"])
        for user in _empfaenger(dok.hochgeladen_von):
            notifier(
                user,
                TypeNotification.PARTNER_VERTRAGSENDE,
                titre=f"Vertragsende in {tage} Tagen: {dok.partner.nom}",
                message=f"{dok.titel} läuft am {dok.gueltig_bis:%d.%m.%Y} aus.",
                lien=f"/admin/partner/{dok.partner_id}",
            )
        anzahl += 1
    return anzahl


def _ende(verknuepfung: PartnerVerknuepfung) -> date | None:
    """Enddatum des verknüpften Ziels, falls es bereits beendet ist."""
    from apps.projets.models import StatutProjet

    heute = timezone.localdate()
    if verknuepfung.evenement_id:
        ev = verknuepfung.evenement
        ende = ev.date_fin or ev.date_evenement
        return ende if ende < heute else None
    if verknuepfung.projet_id:
        projet = verknuepfung.projet
        if projet.statut == StatutProjet.ANNULE:
            return None
        if projet.date_limite and projet.date_limite < heute:
            return projet.date_limite
        if projet.statut == StatutProjet.TERMINE:
            return heute - timedelta(days=1)  # Abschlussdatum ist nicht erfasst
    return None


def _bewertungen(heute: date) -> int:
    anzahl = 0
    offene = (
        PartnerVerknuepfung.objects.filter(bewertung_erinnert=False, bewertungen__isnull=True)
        .exclude(partner__statut=PartnerStatus.ARCHIVIERT)
        .exclude(projet__isnull=True, evenement__isnull=True)  # Produkte haben kein Ende
        .select_related("partner", "projet", "evenement", "created_by")
    )
    for v in offene:
        ende = _ende(v)
        if ende is None or not (1 <= (heute - ende).days <= RUECKSCHAU_TAGE):
            continue
        v.bewertung_erinnert = True
        v.save(update_fields=["bewertung_erinnert"])
        for user in _empfaenger(v.created_by):
            notifier(
                user,
                TypeNotification.PARTNER_BEWERTUNG,
                titre=f"Partner bewerten: {v.partner.nom}",
                message=f"„{v.ziel_label}“ ist beendet – wie lief die Zusammenarbeit?",
                lien=f"/admin/partner/{v.partner_id}",
            )
        anzahl += 1
    return anzahl


@shared_task
def erinnere_partner(today: date | None = None) -> dict:
    heute = today or timezone.localdate()
    return {"vertragsende": _vertragsende(heute), "bewertung": _bewertungen(heute)}

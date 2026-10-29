"""Persönliche Reisedaten werden nach der Reise gelöscht : 90 Tage nach dem Reiseende (ohne Ende :
nach dem Beginn) verschwinden Etappen, Unterkunftswahl, Notizen, Geburtsdatum, persönliche
Checklistenpunkte und Zustimmungen zur gemeinsamen Ankunft. Die Reise selbst, die Teilnehmerliste
(Name, Status), Entscheidungen, Infos, Aufgaben und Kosten bleiben als Rückblick erhalten."""

import logging
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.accounts.services import log_audit_event

from .models import AnkunftZustimmung, ChecklistePunkt, Etappe, Freigabe, Reise

logger = logging.getLogger(__name__)

AUFBEWAHRUNG_TAGE = 90


def bereinige_persoenliche_daten(jetzt=None) -> dict:
    jetzt = jetzt or timezone.now()
    grenze = timezone.localdate(jetzt) - timedelta(days=AUFBEWAHRUNG_TAGE)
    reisen = Reise.objects.filter(daten_bereinigt_am__isnull=True).filter(
        Q(ende__lt=grenze) | Q(ende__isnull=True, start__lt=grenze)
    )
    anzahl = 0
    for reise in reisen:
        Etappe.objects.filter(teilnehmer__reise=reise).delete()
        ChecklistePunkt.objects.filter(reise=reise, besitzer__isnull=False).delete()
        AnkunftZustimmung.objects.filter(teilnehmer__reise=reise).delete()
        reise.teilnehmer.update(
            unterkunft=None,
            unterkunft_eigen="",
            unterkunft_gebucht=False,
            notiz="",
            geburtsdatum=None,
            offen_gemeinsame_anreise=False,
            freigabe_hin=Freigabe.PRIVAT,
            freigabe_rueck=Freigabe.PRIVAT,
            freigabe_unterkunft=Freigabe.PRIVAT,
        )
        reise.daten_bereinigt_am = jetzt
        reise.save(update_fields=["daten_bereinigt_am"])
        anzahl += 1
    if anzahl:
        log_audit_event("reisen_bereinigt", reisen=anzahl)
    logger.info("bereinige_persoenliche_daten: reisen=%s", anzahl)
    return {"reisen": anzahl}

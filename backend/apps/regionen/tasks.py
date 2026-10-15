"""Celery-Aufgaben der Regionen (Release 31)."""

import logging

from celery import shared_task
from django.utils import timezone

from . import mails
from .models import Veranstaltung, VeranstaltungStatus

logger = logging.getLogger(__name__)


@shared_task
def erinnere_teilnehmer() -> int:
    """Täglich : Erinnerung (DE/FR) an alle Angemeldeten für Treffen, die morgen stattfinden.
    Jedes Treffen wird nur einmal erinnert (`erinnert_am`). Gibt die Zahl der Mails zurück."""
    morgen = timezone.localdate() + timezone.timedelta(days=1)
    gesendet = 0
    treffen = Veranstaltung.objects.filter(
        status=VeranstaltungStatus.VEROEFFENTLICHT, datum=morgen, erinnert_am__isnull=True
    ).select_related("region")
    for v in treffen:
        for t in v.teilnahmen.select_related("user"):
            if not t.user.is_active:
                continue
            ok = mails.sende_mail(
                t.user,
                ("Erinnerung: Morgen ist dein Treffen", f"„{v.titel}“ findet morgen statt."),
                ("Rappel : votre rencontre a lieu demain", f"« {v.titel} » a lieu demain."),
                lien=mails.region_link(v),
                details=mails.veranstaltungs_details(v),
            )
            gesendet += int(ok)
        v.erinnert_am = timezone.now()
        v.save(update_fields=["erinnert_am"])
    logger.info("erinnere_teilnehmer: %s Mails", gesendet)
    return gesendet

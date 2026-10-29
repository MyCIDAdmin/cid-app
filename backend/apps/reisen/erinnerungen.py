"""Fristerinnerungen an offene Entscheidungen : 24 und 2 Stunden vor Fristende, an Stimmberechtigte
ohne Stimme. Je Entscheidung, Person und Regel nur einmal (Protokoll `ReiseErinnerung`). Es gilt nur
die engste passende Regel (wer erst kurz vor Ende dazukommt, bekommt nicht beide)."""

import logging
from datetime import timedelta

from django.utils import timezone

from apps.notifications.models import TypeNotification

from . import services as sv
from .models import Entscheidung, EntStatus, ErinnerungRegel, ReiseErinnerung, Stimme

logger = logging.getLogger(__name__)


def erinnere_entscheidungen(jetzt=None) -> dict:
    jetzt = jetzt or timezone.now()
    gesendet = 0
    offene = Entscheidung.objects.filter(
        status=EntStatus.OFFEN,
        frist__gt=jetzt,
        frist__lte=jetzt + timedelta(hours=24),
        reise__abgesagt=False,
    ).select_related("reise")
    for ent in offene:
        rest = ent.frist - jetzt
        regel = ErinnerungRegel.H2 if rest <= timedelta(hours=2) else ErinnerungRegel.H24
        habe_gestimmt = set(
            Stimme.objects.filter(entscheidung=ent).values_list("user_id", flat=True)
        )
        bereits = set(
            ReiseErinnerung.objects.filter(entscheidung=ent, regel=regel).values_list(
                "user_id", flat=True
            )
        )
        for user in sv.empfaenger(ent.reise, ent.teilgruppe_id):
            if user.pk in habe_gestimmt or user.pk in bereits:
                continue
            ReiseErinnerung.objects.create(entscheidung=ent, user=user, regel=regel)
            sv.benachrichtige(
                [user],
                TypeNotification.REISE_FRIST,
                f"Bald Fristende: {ent.titel}",
                f"{ent.reise.titel}: Abstimmung endet "
                f"{timezone.localtime(ent.frist):%d.%m. um %H:%M} Uhr.",
                sv.lien(ent.reise),
            )
            gesendet += 1
    logger.info("erinnere_entscheidungen: gesendet=%s", gesendet)
    return {"gesendet": gesendet}

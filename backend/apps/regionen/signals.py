"""Wettbewerb (Release 30) : Bonus für die Region, wenn ein früheres Fan-Konto Mitglied wird."""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.membres.models import Membre, StatutMembre

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Membre, dispatch_uid="regionen_neumitglied_bonus")
def neumitglied_bonus(sender, instance, created, update_fields, **kwargs):
    if instance.statut != StatutMembre.ACTIF or instance.user_id is None:
        return
    if update_fields is not None and "statut" not in update_fields:
        return
    try:
        from . import wettbewerb

        wettbewerb.buche_neumitglied(instance.user)
    except Exception:  # noqa: BLE001 – die Mitgliedschaft darf nie am Wettbewerb scheitern
        logger.exception("Neumitglied-Bonus fehlgeschlagen für %s", instance.pk)


@receiver(post_save, sender="communaute.RencontreCalendrier", dispatch_uid="regionen_spiel_folgen")
def spiel_folgen(sender, instance, created, **kwargs):
    """Treffen, die an dieses Spiel gebunden sind, folgen dem Spielplan (Datum, Absage)."""
    if created:
        return
    try:
        from .spielverknuepfung import spiel_geaendert

        spiel_geaendert(instance)
    except Exception:  # noqa: BLE001 – der Spielplan-Abgleich darf nie am Treffen scheitern
        logger.exception("Treffen konnten dem Spiel %s nicht folgen", instance.pk)

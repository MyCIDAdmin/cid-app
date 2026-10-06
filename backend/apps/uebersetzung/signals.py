"""Nach dem Speichern eines registrierten Modells wird die Übersetzung im Hintergrund angestoßen
(nur wenn ein DeepL-Schlüssel konfiguriert ist)."""

import logging

from django.apps import apps
from django.db import transaction
from django.db.models.signals import post_save

from . import deepl
from .registry import UEBERSETZBAR
from .tasks import uebersetze_objekt_task

logger = logging.getLogger(__name__)


def _nach_speichern(sender, instance, raw=False, **kwargs):
    if raw or not deepl.ist_aktiv():
        return
    modell = f"{sender._meta.app_label}.{sender._meta.model_name}"
    pk = str(instance.pk)

    def starten():
        try:
            uebersetze_objekt_task.delay(modell, pk)
        except Exception:  # noqa: BLE001 — Broker nicht erreichbar: Speichern darf nie scheitern
            logger.warning("Übersetzungs-Task konnte nicht gestartet werden", exc_info=True)

    transaction.on_commit(starten)


for _schluessel in UEBERSETZBAR:
    post_save.connect(
        _nach_speichern,
        sender=apps.get_model(_schluessel),
        weak=False,
        dispatch_uid=f"uebersetzung-{_schluessel}",
    )

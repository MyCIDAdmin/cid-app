"""Hält die Tickets im Gleichklang mit Anmeldungen, Teilnahmen und Veranstaltungen.

Alle Statuswechsel laufen im Code über `save()` (auch die Zahlungsbestätigung in
apps.cotisations.notifications und das Nachrücken von der Warteliste), daher genügt post_save.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.evenements.models import Evenement, Inscription
from apps.regionen.models import Teilnahme, Veranstaltung

from . import services


@receiver(post_save, sender=Inscription)
def inscription_gespeichert(sender, instance, **kwargs):
    services.inscription_pruefen(instance)


@receiver(post_save, sender=Teilnahme)
def teilnahme_gespeichert(sender, instance, **kwargs):
    services.teilnahme_pruefen(instance)


@receiver(post_save, sender=Evenement)
def evenement_gespeichert(sender, instance, **kwargs):
    services.evenement_pruefen(instance)


@receiver(post_save, sender=Veranstaltung)
def veranstaltung_gespeichert(sender, instance, **kwargs):
    services.veranstaltung_pruefen(instance)

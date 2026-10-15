"""Nach der Zahlung eines Familienpakets werden die weiteren Erwachsenen eingeladen.

`Souscription` wird an mehreren Stellen auf „bezahlt“ gesetzt (Zahlungsbestätigung, Barzahlung,
Import) ; ein Signal fängt alle ab. Das Einladen ist idempotent (nur noch nicht eingeladene
Personen)."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Souscription, StatutSouscription


@receiver(post_save, sender=Souscription)
def einladungen_nach_zahlung(sender, instance, **kwargs):
    if instance.statut != StatutSouscription.PAYEE or not instance.plaetze_erwachsene:
        return
    from .familie import versende_einladungen

    pk = instance.pk
    transaction.on_commit(lambda: versende_einladungen(pk))

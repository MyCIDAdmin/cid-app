"""Erzeugt ein VAPID-Schlüsselpaar für Web-Push und gibt es zum Eintragen in Railway aus."""

from django.core.management.base import BaseCommand

from apps.notifications import push


class Command(BaseCommand):
    help = "Erzeugt ein neues VAPID-Schlüsselpaar (Web-Push). Es wird nichts gespeichert."

    def handle(self, *args, **options):
        oeffentlich, privat = push.schluessel_erzeugen()
        self.stdout.write("Im Railway-Backend-Dienst als Variablen eintragen :\n")
        self.stdout.write(f"VAPID_PUBLIC_KEY={oeffentlich}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={privat}")
        self.stdout.write("VAPID_SUBJECT=mailto:<Kontaktadresse des Vereins>\n")
        self.stdout.write(
            "Der private Schlüssel ist geheim : nicht in den Chat, nicht ins Repository. "
            "Ein neues Paar macht alle angemeldeten Geräte ungültig (sie melden sich neu an)."
        )

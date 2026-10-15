"""Registriert den Webhook des Telegram-Bots (Release 32), z. B. nach dem Einrichten oder wenn
sich die API-Adresse ändert :

    python manage.py telegram_webhook https://api.my-cid.de/api/v1/notifications/telegram/webhook/
"""

from django.core.management.base import BaseCommand, CommandError

from apps.notifications import telegram


class Command(BaseCommand):
    help = "Registriert den Telegram-Webhook (benötigt TELEGRAM_BOT_TOKEN und -WEBHOOK_SECRET)."

    def add_arguments(self, parser):
        parser.add_argument("url", help="Öffentliche HTTPS-Adresse des Webhooks")

    def handle(self, *args, url, **options):
        from django.conf import settings

        if not telegram.bot_konfiguriert():
            raise CommandError("TELEGRAM_BOT_TOKEN ist nicht gesetzt.")
        if not settings.TELEGRAM_WEBHOOK_SECRET:
            raise CommandError("TELEGRAM_WEBHOOK_SECRET ist nicht gesetzt.")
        if not url.startswith("https://"):
            raise CommandError("Telegram verlangt eine HTTPS-Adresse.")
        antwort = telegram.setze_webhook(url)
        self.stdout.write(
            self.style.SUCCESS(f"Webhook gesetzt: {antwort.get('description', 'ok')}")
        )

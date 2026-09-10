"""Attend que PostgreSQL soit prêt avant de continuer (utilisé au démarrage
du conteneur backend, cf docker-compose.yml)."""

import time

from django.core.management.base import BaseCommand
from django.db import connections
from django.db.utils import OperationalError


class Command(BaseCommand):
    help = "Attend la disponibilité de la base de données."

    def handle(self, *args, **options):
        self.stdout.write("En attente de la base de données...")
        db_conn = None
        attempts = 0
        while not db_conn and attempts < 30:
            try:
                connections["default"].cursor()
                db_conn = True
            except OperationalError:
                attempts += 1
                self.stdout.write(
                    f"  Base indisponible, nouvelle tentative dans 1s ({attempts}/30)..."
                )
                time.sleep(1)
        if not db_conn:
            self.stderr.write("Impossible de joindre la base de données après 30 tentatives.")
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS("Base de données disponible !"))

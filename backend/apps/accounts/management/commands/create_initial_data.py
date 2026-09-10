"""
Crée les données initiales nécessaires au démarrage du projet (PPS §3.2,
CID-RFC-001 C-ADH-02) : un compte Administrateur App si aucun n'existe.

Usage : python manage.py create_initial_data --email admin@clubistes.de --password ...
"""

import os

from django.core.management.base import BaseCommand

from apps.accounts.models import Role, User


class Command(BaseCommand):
    help = "Crée le compte Administrateur App initial s'il n'existe pas déjà."

    def add_arguments(self, parser):
        parser.add_argument("--email", default=os.environ.get("INITIAL_ADMIN_EMAIL"))
        parser.add_argument("--password", default=os.environ.get("INITIAL_ADMIN_PASSWORD"))

    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]

        if not email or not password:
            self.stderr.write(
                self.style.ERROR(
                    "Fournir --email et --password, ou INITIAL_ADMIN_EMAIL / "
                    "INITIAL_ADMIN_PASSWORD en variables d'environnement."
                )
            )
            raise SystemExit(1)

        if User.objects.filter(role=Role.SUPER_ADMIN).exists():
            self.stdout.write("Un Administrateur App existe déjà — rien à faire.")
            return

        User.objects.create_superuser(email=email, password=password)
        self.stdout.write(self.style.SUCCESS(f"Administrateur App créé : {email}"))

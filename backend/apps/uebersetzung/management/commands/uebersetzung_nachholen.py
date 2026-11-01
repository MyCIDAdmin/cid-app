"""Übersetzt bestehende Objekte nach, die vor der Registrierung ihres Modells (oder ohne DeepL-
Schlüssel) gespeichert wurden. Vorhandene, zum Original passende Übersetzungen bleiben unberührt,
auch manuell korrigierte. Aufruf: `manage.py uebersetzung_nachholen [adhesions.rabaisoffre ...]`."""

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError

from apps.uebersetzung import deepl
from apps.uebersetzung.registry import UEBERSETZBAR
from apps.uebersetzung.services import uebersetze_objekt


class Command(BaseCommand):
    help = "Übersetzt bestehende Objekte der registrierten Modelle nach (DeepL)."

    def add_arguments(self, parser):
        parser.add_argument("modelle", nargs="*", help="z. B. adhesions.rabaisoffre")

    def handle(self, *args, modelle, **options):
        if not deepl.ist_aktiv():
            raise CommandError("Kein DeepL-Schlüssel konfiguriert (DEEPL_API_KEY).")
        unbekannt = [m for m in modelle if m not in UEBERSETZBAR]
        if unbekannt:
            raise CommandError(f"Nicht registriert: {', '.join(unbekannt)}")
        for modell in modelle or list(UEBERSETZBAR):
            geschrieben = objekte = 0
            for obj in apps.get_model(modell).objects.all().iterator():
                objekte += 1
                geschrieben += uebersetze_objekt(obj)
            self.stdout.write(f"{modell}: {objekte} Objekte, {geschrieben} neue Übersetzungen")

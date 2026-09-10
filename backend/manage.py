#!/usr/bin/env python
"""Utilitaire de ligne de commande Django pour l'administration du projet CID."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Impossible d'importer Django. Est-il installé et "
            "disponible dans votre variable d'environnement PYTHONPATH ? "
            "Avez-vous oublié d'activer un environnement virtuel ?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

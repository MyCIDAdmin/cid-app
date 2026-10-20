from django.apps import AppConfig


class ZentralConfig(AppConfig):
    """Zentrale Einstellungen der App (vom App-Administrator änderbar) und modulübergreifende
    Hinweise für die Übersicht (siehe hinweise.py)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.zentral"
    verbose_name = "Zentrale Einstellungen"

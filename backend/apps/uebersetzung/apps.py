from django.apps import AppConfig


class UebersetzungConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.uebersetzung"
    verbose_name = "Automatische Übersetzungen"

    def ready(self):
        from . import signals  # noqa: F401

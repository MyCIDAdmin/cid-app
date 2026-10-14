from django.apps import AppConfig


class AktivitaetConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.aktivitaet"
    verbose_name = "Aktivität (Protokoll und Berichte)"

    def ready(self):
        from . import signals  # noqa: F401

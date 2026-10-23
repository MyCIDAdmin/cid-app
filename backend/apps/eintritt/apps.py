from django.apps import AppConfig


class EintrittConfig(AppConfig):
    """Eintrittstickets mit QR-Code für Veranstaltungen und regionale Treffen (2026-10-23)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.eintritt"
    verbose_name = "Eintrittstickets"

    def ready(self):
        from . import signals  # noqa: F401

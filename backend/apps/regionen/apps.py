from django.apps import AppConfig


class RegionenConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.regionen"
    verbose_name = "Sektoren"

    def ready(self):
        from . import signals  # noqa: F401

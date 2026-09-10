from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """
    R1 P0 — Modèle notification in-app + tâches Celery email (11 types R1) (RICEFW W-001 à
    W-010).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Notifications"

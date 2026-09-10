from django.apps import AppConfig


class CommunauteConfig(AppConfig):
    """
    R2 P1/P2 — Forum, messagerie AES-256, fil d'actualité, live match, albums, quiz (Release
    Plan §3.2).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.communaute"
    verbose_name = "Communauté"

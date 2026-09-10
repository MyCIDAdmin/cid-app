from django.apps import AppConfig


class VoteConfig(AppConfig):
    """
    R1 P1 — Sessions temps réel, WebSocket Django Channels, anonymat HMAC-SHA256 (FDD §3.5,
    SCD §7.5).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.vote"
    verbose_name = "Vote"

from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    """
    R1 P0/Phase 2B — Fil de notifications in-app (`Notification`) + `services.notifier`, appelé
    en plus de l'email existant depuis accounts/cotisations/evenements/boutique pour les 11 types
    R1 (CID-RPL-001 §2.2 ; RICEFW W-001, W-002, W-004, W-005 — W-003/W-006 (vote) suivront en
    Phase 3 avec apps.vote).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.notifications"
    verbose_name = "Notifications"

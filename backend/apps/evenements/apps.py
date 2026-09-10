from django.apps import AppConfig


class EvenementsConfig(AppConfig):
    """
    R1 P1 — CRUD événements, inscriptions, covoiturage, rappels J-3/J-1 (RICEFW
    F-005/F-006/F-007/W-004/W-005).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.evenements"
    verbose_name = "Événements"

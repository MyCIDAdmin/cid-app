from django.apps import AppConfig


class EvenementsConfig(AppConfig):
    """
    R1 P1 — CRUD événements, inscriptions, covoiturage (FDD §3.4, RICEFW F-005/006/007).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.evenements"
    verbose_name = "Événements"

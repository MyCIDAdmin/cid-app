from django.apps import AppConfig


class CotisationsConfig(AppConfig):
    """
    R1 P0 — Stepper paiement, reçus PDF, relances Celery J-30/7/1 (FDD §3.2, RICEFW
    W-001/W-002).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.cotisations"
    verbose_name = "Cotisations"

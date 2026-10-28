from django.apps import AppConfig


class ReisenConfig(AppConfig):
    """Reisen & Fahrgemeinschaften (Konzept 2026-10-29) : Reiseraum mit Zugang, Entscheidungen,
    Infos, Aufgaben, individuellen Reisewegen, Kostenrechnung. Kein Geld in der App."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.reisen"
    verbose_name = "Reisen"

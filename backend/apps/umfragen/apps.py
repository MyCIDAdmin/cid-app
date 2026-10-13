from django.apps import AppConfig


class UmfragenConfig(AppConfig):
    """Umfragen (Release 11) — Teil des Moduls „Quiz und Umfragen“. Anonym oder namentlich,
    mit Frist, Einzel-/Mehrfachauswahl und Freitext; Ergebnis-Sichtbarkeit pro Umfrage."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.umfragen"
    verbose_name = "Umfragen"

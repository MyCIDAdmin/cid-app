from django.apps import AppConfig


class StatsConfig(AppConfig):
    """
    R1 P1 — KPIs Financier/Membres/Événements + R2 Engagement/Projets, exports PDF/Excel
    (FDD §3.6).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stats"
    verbose_name = "Statistiques"

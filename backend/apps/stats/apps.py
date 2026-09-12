from django.apps import AppConfig


class StatsConfig(AppConfig):
    """
    R1 P1/Phase 2B — KPIs Financier/Membres/Événements (FDD §5.3, 3 onglets R1), lecture seule sur
    les modèles existants (voir services.py) — pas de modèle propre à ce module. Engagement/
    Projets (R2) et exports PDF/Excel (R-001/R-018) restent hors périmètre pour l'instant.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.stats"
    verbose_name = "Statistiques"

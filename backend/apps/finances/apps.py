from django.apps import AppConfig


class FinancesConfig(AppConfig):
    """Saisie des dépenses, budget annuel et catégories — alimente la Jahresbilanz du module
    "Statistiken & KPIs" (apps.stats). Les recettes viennent toujours des modèles existants
    (cotisations, adhésions, boutique, événements) ; seules les dépenses sont saisies ici."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.finances"
    verbose_name = "Finances"

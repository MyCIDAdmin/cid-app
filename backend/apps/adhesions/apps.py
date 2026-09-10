from django.apps import AppConfig


class AdhesionsConfig(AppConfig):
    """
    R1 P0 — Campagnes annuelles, offres (Basic/Plus/Junior), rabais + justificatifs,
    historique immuable (FDD §3.3, TDD §4).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.adhesions"
    verbose_name = "Adhésions"

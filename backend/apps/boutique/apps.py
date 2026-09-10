from django.apps import AppConfig


class BoutiqueConfig(AppConfig):
    """
    R1 P1 — Catalogue, panier, commandes 7 statuts, stock atomique SELECT FOR UPDATE (FDD
    §3.4).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.boutique"
    verbose_name = "Boutique"

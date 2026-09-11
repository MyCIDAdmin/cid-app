from django.contrib import admin

from .models import Cotisation, RelanceCotisation


@admin.register(Cotisation)
class CotisationAdmin(admin.ModelAdmin):
    list_display = (
        "reference_transaction",
        "membre",
        "type_article",
        "libelle",
        "montant",
        "statut",
        "date_paiement",
    )
    list_filter = ("statut", "type_article", "mode_paiement", "annee")
    search_fields = ("reference_transaction", "membre__nom", "membre__prenom", "libelle")
    autocomplete_fields = ("membre", "saisie_par")
    readonly_fields = ("id", "reference_transaction", "created_at", "updated_at")


@admin.register(RelanceCotisation)
class RelanceCotisationAdmin(admin.ModelAdmin):
    """Journal en lecture seule (AHM-18) — jamais créé/modifié à la main, seulement par tasks.py."""

    list_display = ("membre", "annee", "checkpoint", "envoyee_le")
    list_filter = ("checkpoint", "annee")
    search_fields = ("membre__nom", "membre__prenom")
    autocomplete_fields = ("membre",)
    readonly_fields = ("id", "membre", "annee", "checkpoint", "envoyee_le")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

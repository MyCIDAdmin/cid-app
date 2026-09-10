from django.contrib import admin

from .models import Cotisation


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

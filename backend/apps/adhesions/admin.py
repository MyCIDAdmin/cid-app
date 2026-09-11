from django.contrib import admin

from .models import CampagneAdhesion, OffreAdhesion, RabaisOffre, Souscription


class OffreAdhesionInline(admin.TabularInline):
    model = OffreAdhesion
    extra = 0
    fields = ("nom", "prix_plein", "visible", "ordre")


@admin.register(CampagneAdhesion)
class CampagneAdhesionAdmin(admin.ModelAdmin):
    list_display = ("nom", "annee", "statut", "date_debut", "date_fin", "created_by")
    list_filter = ("statut", "annee")
    search_fields = ("nom",)
    autocomplete_fields = ("created_by",)
    readonly_fields = ("id", "created_at")
    inlines = [OffreAdhesionInline]


class RabaisOffreInline(admin.TabularInline):
    model = RabaisOffre
    extra = 0
    fields = (
        "type_rabais",
        "label_fr",
        "montant_reduction",
        "pct_reduction",
        "justificatif_requis",
    )


@admin.register(OffreAdhesion)
class OffreAdhesionAdmin(admin.ModelAdmin):
    list_display = ("nom", "campagne", "prix_plein", "visible", "ordre")
    list_filter = ("visible", "campagne__annee")
    search_fields = ("nom",)
    inlines = [RabaisOffreInline]


@admin.register(RabaisOffre)
class RabaisOffreAdmin(admin.ModelAdmin):
    list_display = ("label_fr", "offre", "type_rabais", "justificatif_requis")
    list_filter = ("type_rabais", "justificatif_requis")
    search_fields = ("label_fr", "offre__nom")


@admin.register(Souscription)
class SouscriptionAdmin(admin.ModelAdmin):
    list_display = ("membre", "offre", "campagne", "statut", "prix_paye", "date_souscription")
    list_filter = ("statut", "campagne__annee")
    search_fields = ("membre__nom", "membre__prenom", "offre__nom")
    autocomplete_fields = ("membre", "offre", "campagne", "rabais", "cotisation")
    readonly_fields = ("id", "created_at", "updated_at")

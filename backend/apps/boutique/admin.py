from django.contrib import admin

from .models import Commande, LigneCommande, Produit, VarianteProduit


class VarianteProduitInline(admin.TabularInline):
    model = VarianteProduit
    extra = 0
    fields = ("taille", "couleur", "stock")


@admin.register(Produit)
class ProduitAdmin(admin.ModelAdmin):
    list_display = ("nom", "categorie", "prix", "statut", "stock_total", "nouveaute")
    list_filter = ("statut", "categorie", "nouveaute")
    search_fields = ("nom",)
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [VarianteProduitInline]


@admin.register(VarianteProduit)
class VarianteProduitAdmin(admin.ModelAdmin):
    list_display = ("produit", "taille", "couleur", "stock")
    list_filter = ("produit__categorie",)
    search_fields = ("produit__nom",)
    autocomplete_fields = ("produit",)
    readonly_fields = ("id",)


class LigneCommandeInline(admin.TabularInline):
    model = LigneCommande
    extra = 0
    fields = ("variante", "quantite", "prix_unitaire")
    readonly_fields = ("prix_unitaire",)
    autocomplete_fields = ("variante",)


@admin.register(Commande)
class CommandeAdmin(admin.ModelAdmin):
    list_display = ("numero_commande", "membre", "statut", "montant_total", "created_at")
    list_filter = ("statut",)
    search_fields = ("numero_commande", "membre__nom", "membre__prenom")
    autocomplete_fields = ("membre",)
    readonly_fields = ("id", "numero_commande", "montant_total", "created_at", "updated_at")
    inlines = [LigneCommandeInline]

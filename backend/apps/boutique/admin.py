from django.contrib import admin

from .models import (
    BonAchat,
    Commande,
    LigneCommande,
    Produit,
    RegleReduction,
    UtilisationBonAchat,
    VarianteProduit,
)


class VarianteProduitInline(admin.TabularInline):
    model = VarianteProduit
    extra = 0
    fields = ("taille", "couleur", "stock")


class RegleReductionInline(admin.TabularInline):
    model = RegleReduction
    extra = 0
    fields = ("seuil_quantite", "type_reduction", "pourcentage", "actif")


@admin.register(Produit)
class ProduitAdmin(admin.ModelAdmin):
    list_display = ("nom", "categorie", "type_produit", "prix", "statut", "stock_total", "nouveaute")
    list_filter = ("statut", "categorie", "type_produit", "nouveaute")
    search_fields = ("nom",)
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [VarianteProduitInline, RegleReductionInline]


@admin.register(RegleReduction)
class RegleReductionAdmin(admin.ModelAdmin):
    list_display = ("produit", "seuil_quantite", "type_reduction", "pourcentage", "actif")
    list_filter = ("type_reduction", "actif")
    search_fields = ("produit__nom",)
    autocomplete_fields = ("produit",)
    readonly_fields = ("id", "created_at", "updated_at")


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


class UtilisationBonAchatInline(admin.TabularInline):
    model = UtilisationBonAchat
    extra = 0
    fields = ("commande", "montant", "created_at")
    readonly_fields = ("commande", "montant", "created_at")
    can_delete = False
    autocomplete_fields = ("commande",)


@admin.register(BonAchat)
class BonAchatAdmin(admin.ModelAdmin):
    list_display = ("code", "achete_par", "montant_initial", "solde", "statut", "date_expiration")
    list_filter = ("statut", "mode_paiement")
    search_fields = ("code", "achete_par__nom", "achete_par__prenom")
    autocomplete_fields = ("achete_par", "paiement_confirme_par")
    readonly_fields = ("id", "code", "created_at", "updated_at")
    inlines = [UtilisationBonAchatInline]

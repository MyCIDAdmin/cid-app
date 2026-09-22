from django.contrib import admin

from .models import Projet, ProjetImage, ProjetMiseAJour, ProjetMiseAJourImage


class ProjetImageInline(admin.TabularInline):
    model = ProjetImage
    extra = 0
    fields = ("image", "ordre", "uploaded_by")
    readonly_fields = ("uploaded_by",)


class ProjetMiseAJourImageInline(admin.TabularInline):
    model = ProjetMiseAJourImage
    extra = 0
    fields = ("image", "ordre")


@admin.register(Projet)
class ProjetAdmin(admin.ModelAdmin):
    list_display = (
        "titre",
        "statut",
        "responsable",
        "cagnote_active",
        "objectif_montant",
        "date_limite",
        "ordre",
    )
    list_filter = ("statut", "cagnote_active")
    search_fields = ("titre", "responsable__nom", "responsable__prenom")
    autocomplete_fields = ("responsable", "created_by")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ProjetImageInline]


@admin.register(ProjetMiseAJour)
class ProjetMiseAJourAdmin(admin.ModelAdmin):
    list_display = ("titre", "projet", "created_by", "created_at")
    search_fields = ("titre", "projet__titre")
    autocomplete_fields = ("projet", "created_by")
    readonly_fields = ("id", "created_at")
    inlines = [ProjetMiseAJourImageInline]

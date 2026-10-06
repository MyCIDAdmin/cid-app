from django.contrib import admin

from .models import (
    Aufgabe,
    Projet,
    ProjetImage,
    ProjetMiseAJour,
    ProjetMiseAJourImage,
    ProjetMitglied,
)


class ProjetImageInline(admin.TabularInline):
    model = ProjetImage
    extra = 0
    fields = ("image", "ordre", "uploaded_by")
    readonly_fields = ("uploaded_by",)


class ProjetMiseAJourImageInline(admin.TabularInline):
    model = ProjetMiseAJourImage
    extra = 0
    fields = ("image", "ordre")


class ProjetMitgliedInline(admin.TabularInline):
    model = ProjetMitglied
    extra = 0
    autocomplete_fields = ("membre",)


@admin.register(Aufgabe)
class AufgabeAdmin(admin.ModelAdmin):
    list_display = ("titel", "projet", "status", "verantwortlich", "frist")
    list_filter = ("status", "prioritaet")
    search_fields = ("titel", "projet__titre")
    autocomplete_fields = ("projet", "verantwortlich", "created_by")
    readonly_fields = ("id", "created_at", "updated_at", "erledigt_am")


@admin.register(Projet)
class ProjetAdmin(admin.ModelAdmin):
    list_display = (
        "titre",
        "statut",
        "sichtbarkeit",
        "responsable",
        "cagnote_active",
        "objectif_montant",
        "date_limite",
        "ordre",
    )
    list_filter = ("statut", "sichtbarkeit", "cagnote_active")
    search_fields = ("titre", "responsable__nom", "responsable__prenom")
    autocomplete_fields = ("responsable", "created_by")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ProjetImageInline, ProjetMitgliedInline]


@admin.register(ProjetMiseAJour)
class ProjetMiseAJourAdmin(admin.ModelAdmin):
    list_display = ("titre", "projet", "created_by", "created_at")
    search_fields = ("titre", "projet__titre")
    autocomplete_fields = ("projet", "created_by")
    readonly_fields = ("id", "created_at")
    inlines = [ProjetMiseAJourImageInline]

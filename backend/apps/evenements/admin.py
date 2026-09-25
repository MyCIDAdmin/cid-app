from django.contrib import admin

from .models import Covoiturage, Evenement, Inscription, ReservationCovoiturage


class InscriptionInline(admin.TabularInline):
    model = Inscription
    extra = 0
    fields = (
        "membre",
        "places",
        "nombre_accompagnants_adultes",
        "nombre_accompagnants_enfants",
        "regime_alimentaire",
        "statut",
        "montant_paye",
    )
    readonly_fields = ("montant_paye",)


@admin.register(Evenement)
class EvenementAdmin(admin.ModelAdmin):
    list_display = (
        "titre",
        "type_evenement",
        "date_evenement",
        "statut",
        "places_max",
        "places_reservees",
        "organisateur",
        "accompagnants_payants",
    )
    list_filter = ("statut", "type_evenement", "date_evenement", "accompagnants_payants")
    search_fields = ("titre", "lieu")
    autocomplete_fields = ("organisateur", "created_by")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [InscriptionInline]


@admin.register(Inscription)
class InscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "membre",
        "evenement",
        "places",
        "nombre_accompagnants_adultes",
        "nombre_accompagnants_enfants",
        "statut",
        "montant_paye",
        "created_at",
    )
    list_filter = ("statut",)
    search_fields = ("membre__nom", "membre__prenom", "evenement__titre")
    autocomplete_fields = ("membre", "evenement", "cotisation")
    readonly_fields = ("id", "created_at", "updated_at")


class ReservationCovoiturageInline(admin.TabularInline):
    model = ReservationCovoiturage
    extra = 0
    fields = ("membre", "places_reservees", "statut")


@admin.register(Covoiturage)
class CovoiturageAdmin(admin.ModelAdmin):
    list_display = (
        "depart",
        "destination",
        "date_trajet",
        "heure_trajet",
        "conducteur",
        "places_disponibles",
        "places_reservees",
    )
    list_filter = ("date_trajet",)
    search_fields = ("depart", "destination", "conducteur__nom", "conducteur__prenom")
    autocomplete_fields = ("conducteur", "evenement")
    readonly_fields = ("id", "created_at")
    inlines = [ReservationCovoiturageInline]


@admin.register(ReservationCovoiturage)
class ReservationCovoiturageAdmin(admin.ModelAdmin):
    list_display = ("membre", "trajet", "places_reservees", "statut", "created_at")
    list_filter = ("statut",)
    search_fields = ("membre__nom", "membre__prenom")
    autocomplete_fields = ("membre", "trajet")
    readonly_fields = ("id", "created_at")

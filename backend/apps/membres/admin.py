from django.contrib import admin

from .models import Membre


@admin.register(Membre)
class MembreAdmin(admin.ModelAdmin):
    list_display = (
        "numero_membre",
        "prenom",
        "nom",
        "pays",
        "ville_de",
        "cin_masque",
        "statut",
        "date_adhesion",
        "user",
    )
    list_filter = ("statut", "pays", "land_de", "sexe")
    search_fields = ("numero_membre", "prenom", "nom", "email", "ville_de", "user__email")
    readonly_fields = ("numero_membre", "created_at", "updated_at")
    ordering = ("nom", "prenom")
    autocomplete_fields = ("user",)

    fieldsets = (
        (None, {"fields": ("numero_membre", "user", "statut", "photo")}),
        ("Identité", {"fields": ("prenom", "nom", "date_naissance", "sexe")}),
        ("Contact", {"fields": ("email", "telephone")}),
        ("Pièces d'identité (chiffrées)", {"fields": ("cin", "passeport")}),
        (
            "Pays et adresse",
            {"fields": ("pays", "adresse_de", "code_postal_de", "ville_de", "land_de")},
        ),
        ("Origine — Tunisie", {"fields": ("ville_origine_tn", "gouvernorat_tn")}),
        ("Métadonnées", {"fields": ("date_adhesion", "created_at", "updated_at")}),
    )

    @admin.display(description="CIN")
    def cin_masque(self, obj):
        """
        N'affiche que les 3 derniers caractères dans la liste — la valeur complète en clair
        reste consultable uniquement sur la fiche détail (déjà restreinte au staff Django admin
        par les permissions is_staff standard). Réduit l'exposition en cas de capture d'écran
        de la vue liste.
        """
        if not obj.cin:
            return "—"
        return f"···{obj.cin[-3:]}"

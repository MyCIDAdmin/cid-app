from django.contrib import admin

from .models import (
    Commentaire,
    Hashtag,
    Publication,
    PublicationLike,
    PublicationPartage,
    ReponseForum,
    Sujet,
)


@admin.register(Publication)
class PublicationAdmin(admin.ModelAdmin):
    list_display = ["id", "auteur", "est_masquee", "created_at"]
    list_filter = ["est_masquee"]
    search_fields = ["contenu", "auteur__nom", "auteur__prenom"]


@admin.register(Commentaire)
class CommentaireAdmin(admin.ModelAdmin):
    list_display = ["id", "publication", "auteur", "est_masque", "created_at"]
    list_filter = ["est_masque"]


@admin.register(Hashtag)
class HashtagAdmin(admin.ModelAdmin):
    list_display = ["label", "created_at"]
    search_fields = ["label"]


admin.site.register(PublicationLike)
admin.site.register(PublicationPartage)


@admin.register(Sujet)
class SujetAdmin(admin.ModelAdmin):
    list_display = [
        "titre",
        "categorie",
        "auteur",
        "est_epingle",
        "est_verrouille",
        "est_masque",
        "created_at",
    ]
    list_filter = ["categorie", "est_epingle", "est_verrouille", "est_masque"]
    search_fields = ["titre", "contenu"]


@admin.register(ReponseForum)
class ReponseForumAdmin(admin.ModelAdmin):
    list_display = ["id", "sujet", "auteur", "est_masquee", "created_at"]
    list_filter = ["est_masquee"]

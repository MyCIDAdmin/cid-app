from django.contrib import admin

from .models import (
    Commentaire,
    Conversation,
    GroupeChat,
    Hashtag,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
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


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "membre_a", "membre_b", "created_at"]
    search_fields = ["membre_a__nom", "membre_a__prenom", "membre_b__nom", "membre_b__prenom"]


@admin.register(MessagePrive)
class MessagePriveAdmin(admin.ModelAdmin):
    # Volontairement AUCUN affichage de `contenu` (chiffré AES-256, CID-SCD-001) — même
    # principe de confidentialité que Membre.cin/passeport, mais sans équivalent masqué
    # pertinent pour un message libre : seule la métadonnée est utile en administration.
    list_display = ["id", "conversation", "expediteur", "est_lu", "created_at"]
    list_filter = ["est_lu"]


@admin.register(GroupeChat)
class GroupeChatAdmin(admin.ModelAdmin):
    list_display = ["nom", "type_groupe", "createur", "created_at"]
    list_filter = ["type_groupe"]
    search_fields = ["nom"]


@admin.register(MembreGroupe)
class MembreGroupeAdmin(admin.ModelAdmin):
    list_display = ["groupe", "membre", "created_at"]


@admin.register(MessageGroupe)
class MessageGroupeAdmin(admin.ModelAdmin):
    list_display = ["id", "groupe", "auteur", "created_at"]

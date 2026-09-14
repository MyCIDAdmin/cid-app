from django.contrib import admin

from .models import (
    Album,
    ChoixQuestion,
    Commentaire,
    Conversation,
    GroupeChat,
    Hashtag,
    Match,
    MatchCommentaire,
    MatchReaction,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    ParticipationQuiz,
    Photo,
    PhotoCommentaire,
    PhotoLike,
    Publication,
    PublicationLike,
    PublicationPartage,
    Quiz,
    QuestionQuiz,
    ReponseForum,
    ReponseQuiz,
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


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = [
        "adversaire",
        "date_heure",
        "statut",
        "score_ca",
        "score_adversaire",
        "minute_chrono",
    ]
    list_filter = ["statut"]
    search_fields = ["adversaire", "competition"]


@admin.register(MatchCommentaire)
class MatchCommentaireAdmin(admin.ModelAdmin):
    list_display = ["id", "match", "auteur", "created_at"]


admin.site.register(MatchReaction)


@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ["nom", "evenement", "createur", "created_at"]
    search_fields = ["nom"]


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ["id", "album", "membre", "est_masquee", "created_at"]
    list_filter = ["est_masquee"]


admin.site.register(PhotoLike)


@admin.register(PhotoCommentaire)
class PhotoCommentaireAdmin(admin.ModelAdmin):
    list_display = ["id", "photo", "auteur", "created_at"]


class ChoixQuestionInline(admin.TabularInline):
    model = ChoixQuestion
    extra = 4


@admin.register(QuestionQuiz)
class QuestionQuizAdmin(admin.ModelAdmin):
    list_display = ["texte", "quiz", "ordre", "points"]
    list_filter = ["quiz"]
    inlines = [ChoixQuestionInline]


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ["titre", "est_actif", "created_at"]
    list_filter = ["est_actif"]
    search_fields = ["titre"]


@admin.register(ParticipationQuiz)
class ParticipationQuizAdmin(admin.ModelAdmin):
    list_display = ["quiz", "membre", "score", "demarree_le", "terminee_le"]
    list_filter = ["quiz"]


admin.site.register(ReponseQuiz)

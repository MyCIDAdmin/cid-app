from django.contrib import admin

from .models import ParticipationVote, VoteExprime, VoteOption, VoteOptionCandidat, VoteSession


class VoteOptionInline(admin.TabularInline):
    model = VoteOption
    extra = 0


class VoteOptionCandidatInline(admin.TabularInline):
    """Composition d'une liste — voir VoteOptionCandidat (une VoteOption peut représenter
    soit un candidat individuel, soit une liste ; dans ce dernier cas ses candidats
    apparaissent ici)."""

    model = VoteOptionCandidat
    extra = 0


@admin.register(VoteSession)
class VoteSessionAdmin(admin.ModelAdmin):
    list_display = ("titre", "type_vote", "mode_anonymat", "statut", "date_ouverture", "date_fin")
    list_filter = ("statut", "type_vote", "mode_anonymat")
    search_fields = ("titre",)
    inlines = [VoteOptionInline]
    readonly_fields = ("anonymat_sel",)


@admin.register(VoteOption)
class VoteOptionAdmin(admin.ModelAdmin):
    """Enregistré séparément (en plus de l'inline VoteSessionAdmin) pour permettre l'accès
    à VoteOptionCandidatInline — Django ne prend pas en charge les inlines imbriqués sur
    plus d'un niveau depuis VoteSessionAdmin."""

    list_display = ("label", "session", "ordre")
    list_filter = ("session",)
    search_fields = ("label",)
    inlines = [VoteOptionCandidatInline]


@admin.register(VoteExprime)
class VoteExprimeAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "created_at")
    list_filter = ("session",)


@admin.register(ParticipationVote)
class ParticipationVoteAdmin(admin.ModelAdmin):
    list_display = ("session", "membre", "voted_at")
    list_filter = ("session",)

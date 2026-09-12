from django.contrib import admin

from .models import ParticipationVote, VoteExprime, VoteOption, VoteSession


class VoteOptionInline(admin.TabularInline):
    model = VoteOption
    extra = 0


@admin.register(VoteSession)
class VoteSessionAdmin(admin.ModelAdmin):
    list_display = ("titre", "type_vote", "mode_anonymat", "statut", "date_ouverture", "date_fin")
    list_filter = ("statut", "type_vote", "mode_anonymat")
    search_fields = ("titre",)
    inlines = [VoteOptionInline]
    readonly_fields = ("anonymat_sel",)


@admin.register(VoteExprime)
class VoteExprimeAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "created_at")
    list_filter = ("session",)


@admin.register(ParticipationVote)
class ParticipationVoteAdmin(admin.ModelAdmin):
    list_display = ("session", "membre", "voted_at")
    list_filter = ("session",)

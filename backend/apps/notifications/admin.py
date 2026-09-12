from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("destinataire", "type_notification", "titre", "lu", "created_at")
    list_filter = ("type_notification", "lu")
    search_fields = ("destinataire__email", "titre")
    autocomplete_fields = ("destinataire",)
    readonly_fields = ("id", "created_at")

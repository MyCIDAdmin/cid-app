from django.contrib import admin

from .models import ZentraleEinstellungen


@admin.register(ZentraleEinstellungen)
class ZentraleEinstellungenAdmin(admin.ModelAdmin):
    list_display = ("__str__", "warenkorb_reservierung_minuten", "updated_at")

    def has_add_permission(self, request):
        return not ZentraleEinstellungen.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

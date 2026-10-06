from django.contrib import admin

from .models import BudgetAnnuel, CategorieDepense, Depense, FinanzProtokoll, Jahresabschluss

admin.site.register(CategorieDepense)
admin.site.register(Depense)
admin.site.register(BudgetAnnuel)


class NurLesen(admin.ModelAdmin):
    """Protokoll und Abschlüsse sind append-only — auch im Django-Admin nicht veränderbar."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(FinanzProtokoll, NurLesen)
admin.site.register(Jahresabschluss, NurLesen)

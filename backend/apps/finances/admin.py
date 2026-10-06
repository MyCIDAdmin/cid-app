from django.contrib import admin

from .models import BudgetAnnuel, CategorieDepense, Depense

admin.site.register(CategorieDepense)
admin.site.register(Depense)
admin.site.register(BudgetAnnuel)

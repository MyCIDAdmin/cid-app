from django.contrib import admin

from .models import Bekanntmachung, Einspruch, Kandidatur, Protokoll, Reglement, Wahl

admin.site.register(Wahl)
admin.site.register(Kandidatur)
admin.site.register(Bekanntmachung)
admin.site.register(Einspruch)
admin.site.register(Protokoll)
admin.site.register(Reglement)

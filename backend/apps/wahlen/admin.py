from django.contrib import admin

from .models import Bekanntmachung, Einspruch, Kandidatur, Protokoll, Wahl

admin.site.register(Wahl)
admin.site.register(Kandidatur)
admin.site.register(Bekanntmachung)
admin.site.register(Einspruch)
admin.site.register(Protokoll)

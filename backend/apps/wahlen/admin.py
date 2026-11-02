from django.contrib import admin

from .models import Bekanntmachung, Kandidatur, Wahl

admin.site.register(Wahl)
admin.site.register(Kandidatur)
admin.site.register(Bekanntmachung)

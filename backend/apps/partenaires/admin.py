from django.contrib import admin

from .models import Partner, PartnerBewertung, PartnerKategorie, PartnerVerknuepfung

admin.site.register(PartnerKategorie)
admin.site.register(Partner)
admin.site.register(PartnerVerknuepfung)
admin.site.register(PartnerBewertung)

from django.urls import path

from .views import AktionenView, ExportView, JournalView, UebersichtView

app_name = "aktivitaet"

urlpatterns = [
    path("uebersicht/", UebersichtView.as_view(), name="uebersicht"),
    path("journal/", JournalView.as_view(), name="journal"),
    path("journal/export/", ExportView.as_view(), name="export"),
    path("aktionen/", AktionenView.as_view(), name="aktionen"),
]

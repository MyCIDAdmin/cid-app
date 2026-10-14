from django.urls import path

from .views import (
    AktionenView,
    AuffaelligkeitenView,
    ErledigenView,
    ExportView,
    JournalView,
    NutzungView,
    UebersichtView,
)

app_name = "aktivitaet"

urlpatterns = [
    path("uebersicht/", UebersichtView.as_view(), name="uebersicht"),
    path("journal/", JournalView.as_view(), name="journal"),
    path("journal/export/", ExportView.as_view(), name="export"),
    path("auffaelligkeiten/", AuffaelligkeitenView.as_view(), name="auffaelligkeiten"),
    path("auffaelligkeiten/<uuid:pk>/erledigen/", ErledigenView.as_view(), name="erledigen"),
    path("nutzung/", NutzungView.as_view(), name="nutzung"),
    path("aktionen/", AktionenView.as_view(), name="aktionen"),
]

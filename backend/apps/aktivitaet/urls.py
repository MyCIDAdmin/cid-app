from django.urls import path

from .views import (
    AbschliessenView,
    AktionenView,
    AuffaelligkeitenView,
    BerichtDetailView,
    BerichtErzeugenView,
    BerichteView,
    BerichtSendenView,
    EntscheidenView,
    ErledigenView,
    ExportView,
    JournalView,
    NutzungView,
    ReviewDetailView,
    ReviewListeView,
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
    path("berichte/", BerichteView.as_view(), name="berichte"),
    path("berichte/<int:jahr>/<int:monat>/", BerichtDetailView.as_view(), name="bericht"),
    path(
        "berichte/<int:jahr>/<int:monat>/erzeugen/",
        BerichtErzeugenView.as_view(),
        name="bericht-erzeugen",
    ),
    path(
        "berichte/<int:jahr>/<int:monat>/senden/",
        BerichtSendenView.as_view(),
        name="bericht-senden",
    ),
    path("review/", ReviewListeView.as_view(), name="review-liste"),
    path("review/<uuid:pk>/", ReviewDetailView.as_view(), name="review"),
    path(
        "review/<uuid:pk>/positionen/<uuid:position>/",
        EntscheidenView.as_view(),
        name="review-entscheiden",
    ),
    path("review/<uuid:pk>/abschliessen/", AbschliessenView.as_view(), name="review-abschliessen"),
    path("aktionen/", AktionenView.as_view(), name="aktionen"),
]

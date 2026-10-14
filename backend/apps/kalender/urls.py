from django.urls import path
from rest_framework.routers import DefaultRouter

from .sitzung_views import BeschlussAufgabeView, BeschlussView, ProtokollVersendenView, SitzungView
from .umfrage_views import AbstimmenView, EntscheidenView, UmfrageDetailView, UmfrageListeView
from .views import AusblendenView, DienstViewSet, EintraegeView, TerminViewSet, ZugangView

app_name = "kalender"

router = DefaultRouter()
router.register("termine", TerminViewSet, basename="termin")
router.register("dienste", DienstViewSet, basename="dienst")

urlpatterns = [
    path("zugang/", ZugangView.as_view(), name="zugang"),
    path("ausblenden/", AusblendenView.as_view(), name="ausblenden"),
    path("eintraege/", EintraegeView.as_view(), name="eintraege"),
    path("termine/<uuid:termin_id>/sitzung/", SitzungView.as_view(), name="sitzung"),
    path(
        "termine/<uuid:termin_id>/sitzung/beschluesse/",
        BeschlussView.as_view(),
        name="sitzung-beschluesse",
    ),
    path(
        "termine/<uuid:termin_id>/sitzung/beschluesse/<uuid:beschluss_id>/",
        BeschlussView.as_view(),
        name="sitzung-beschluss",
    ),
    path(
        "termine/<uuid:termin_id>/sitzung/beschluesse/<uuid:beschluss_id>/aufgabe/",
        BeschlussAufgabeView.as_view(),
        name="sitzung-aufgabe",
    ),
    path(
        "termine/<uuid:termin_id>/sitzung/versenden/",
        ProtokollVersendenView.as_view(),
        name="sitzung-versenden",
    ),
    path("terminumfragen/", UmfrageListeView.as_view(), name="terminumfragen"),
    path("terminumfragen/<uuid:pk>/", UmfrageDetailView.as_view(), name="terminumfrage"),
    path("terminumfragen/<uuid:pk>/abstimmen/", AbstimmenView.as_view(), name="abstimmen"),
    path("terminumfragen/<uuid:pk>/entscheiden/", EntscheidenView.as_view(), name="entscheiden"),
    *router.urls,
]

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import EintraegeView, TerminViewSet, ZugangView

app_name = "kalender"

router = DefaultRouter()
router.register("termine", TerminViewSet, basename="termin")

urlpatterns = [
    path("zugang/", ZugangView.as_view(), name="zugang"),
    path("eintraege/", EintraegeView.as_view(), name="eintraege"),
    *router.urls,
]

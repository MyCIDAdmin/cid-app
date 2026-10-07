from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    PartnerBewertungLoeschenView,
    PartnerKategorieViewSet,
    PartnerVerknuepfungLoeschenView,
    PartnerViewSet,
    PartnerZieleView,
)

app_name = "partenaires"

router = DefaultRouter()
router.register("partner", PartnerViewSet, basename="partner")
router.register("kategorien", PartnerKategorieViewSet, basename="kategorie")

urlpatterns = [
    path("ziele/", PartnerZieleView.as_view(), name="ziele"),
    path(
        "verknuepfungen/<uuid:pk>/",
        PartnerVerknuepfungLoeschenView.as_view(),
        name="verknuepfung-loeschen",
    ),
    path(
        "bewertungen/<uuid:pk>/", PartnerBewertungLoeschenView.as_view(), name="bewertung-loeschen"
    ),
] + router.urls

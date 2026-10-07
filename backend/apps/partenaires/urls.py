from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AngebotViewSet,
    AusgabenImportView,
    PartnerBewertungLoeschenView,
    PartnerDokumentView,
    PartnerKategorieViewSet,
    PartnerKontaktViewSet,
    PartnerVerknuepfungLoeschenView,
    PartnerViewSet,
    PartnerZieleView,
)

app_name = "partenaires"

router = DefaultRouter()
router.register("partner", PartnerViewSet, basename="partner")
router.register("kategorien", PartnerKategorieViewSet, basename="kategorie")
router.register("kontakte", PartnerKontaktViewSet, basename="kontakt")
router.register("angebote", AngebotViewSet, basename="angebot")

urlpatterns = [
    path("ziele/", PartnerZieleView.as_view(), name="ziele"),
    path("import-ausgaben/", AusgabenImportView.as_view(), name="import-ausgaben"),
    path("dokumente/<uuid:pk>/", PartnerDokumentView.as_view(), name="dokument"),
    path(
        "verknuepfungen/<uuid:pk>/",
        PartnerVerknuepfungLoeschenView.as_view(),
        name="verknuepfung-loeschen",
    ),
    path(
        "bewertungen/<uuid:pk>/", PartnerBewertungLoeschenView.as_view(), name="bewertung-loeschen"
    ),
] + router.urls

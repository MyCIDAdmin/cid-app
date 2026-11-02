from rest_framework.routers import DefaultRouter

from .views import BekanntmachungViewSet, EinspruchViewSet, KandidaturViewSet, WahlViewSet

app_name = "wahlen"

router = DefaultRouter()
router.register("kandidaturen", KandidaturViewSet, basename="wahlen-kandidatur")
router.register("bekanntmachungen", BekanntmachungViewSet, basename="wahlen-bekanntmachung")
router.register("einsprueche", EinspruchViewSet, basename="wahlen-einspruch")
router.register("", WahlViewSet, basename="wahlen-wahl")

urlpatterns = router.urls

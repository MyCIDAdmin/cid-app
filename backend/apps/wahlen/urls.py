from rest_framework.routers import DefaultRouter

from .views import (
    BekanntmachungViewSet,
    EinspruchViewSet,
    KandidaturViewSet,
    MitteilungViewSet,
    ReglementViewSet,
    WahlTerminViewSet,
    WahlViewSet,
)

app_name = "wahlen"

router = DefaultRouter()
router.register("kandidaturen", KandidaturViewSet, basename="wahlen-kandidatur")
router.register("bekanntmachungen", BekanntmachungViewSet, basename="wahlen-bekanntmachung")
router.register("einsprueche", EinspruchViewSet, basename="wahlen-einspruch")
router.register("mitteilungen", MitteilungViewSet, basename="wahlen-mitteilung")
router.register("reglemente", ReglementViewSet, basename="wahlen-reglement")
router.register("termine", WahlTerminViewSet, basename="wahlen-termin")
router.register("", WahlViewSet, basename="wahlen-wahl")

urlpatterns = router.urls

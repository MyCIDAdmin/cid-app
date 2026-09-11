from rest_framework.routers import DefaultRouter

from .views import (
    CovoiturageViewSet,
    EvenementViewSet,
    InscriptionViewSet,
    ReservationCovoiturageViewSet,
)

app_name = "evenements"

router = DefaultRouter()
router.register("evenements", EvenementViewSet, basename="evenement")
router.register("inscriptions", InscriptionViewSet, basename="inscription")
router.register("covoiturages", CovoiturageViewSet, basename="covoiturage")
router.register(
    "reservations-covoiturage", ReservationCovoiturageViewSet, basename="reservation-covoiturage"
)

urlpatterns = router.urls

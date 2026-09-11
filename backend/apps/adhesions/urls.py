from rest_framework.routers import DefaultRouter

from .views import (
    CampagneAdhesionViewSet,
    JustificatifRabaisViewSet,
    OffreAdhesionViewSet,
    RabaisOffreViewSet,
    SouscriptionViewSet,
)

app_name = "adhesions"

router = DefaultRouter()
router.register("campagnes", CampagneAdhesionViewSet, basename="campagne")
router.register("offres", OffreAdhesionViewSet, basename="offre")
router.register("rabais", RabaisOffreViewSet, basename="rabais")
router.register("souscriptions", SouscriptionViewSet, basename="souscription")
router.register("justificatifs", JustificatifRabaisViewSet, basename="justificatif")

urlpatterns = router.urls

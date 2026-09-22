from rest_framework.routers import DefaultRouter

from .views import (
    ProjetImageViewSet,
    ProjetMiseAJourImageViewSet,
    ProjetMiseAJourViewSet,
    ProjetViewSet,
)

app_name = "projets"

router = DefaultRouter()
router.register("projets", ProjetViewSet, basename="projet")
router.register("images", ProjetImageViewSet, basename="projet-image")
router.register("mises-a-jour", ProjetMiseAJourViewSet, basename="projet-mise-a-jour")
router.register(
    "mises-a-jour-images", ProjetMiseAJourImageViewSet, basename="projet-mise-a-jour-image"
)

urlpatterns = router.urls

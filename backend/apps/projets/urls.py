from rest_framework.routers import DefaultRouter

from .views import (
    AufgabeKommentarViewSet,
    AufgabeViewSet,
    ProjetImageViewSet,
    ProjetMiseAJourImageViewSet,
    ProjetMiseAJourViewSet,
    ProjetTeamViewSet,
    ProjetViewSet,
)

app_name = "projets"

router = DefaultRouter()
router.register("projets", ProjetViewSet, basename="projet")
router.register("team", ProjetTeamViewSet, basename="projet-team")
router.register("aufgaben", AufgabeViewSet, basename="projet-aufgabe")
router.register("aufgaben-kommentare", AufgabeKommentarViewSet, basename="projet-aufgabe-kommentar")
router.register("images", ProjetImageViewSet, basename="projet-image")
router.register("mises-a-jour", ProjetMiseAJourViewSet, basename="projet-mise-a-jour")
router.register(
    "mises-a-jour-images", ProjetMiseAJourImageViewSet, basename="projet-mise-a-jour-image"
)

urlpatterns = router.urls

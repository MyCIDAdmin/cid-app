from rest_framework.routers import DefaultRouter

from .stellen_views import BewerbungViewSet, StelleViewSet
from .views import (
    AufgabeKommentarViewSet,
    AufgabeViewSet,
    MeilensteinViewSet,
    PlanKostenViewSet,
    ProjetAktivitaetViewSet,
    ProjetImageViewSet,
    ProjetKostenViewSet,
    ProjetMiseAJourImageViewSet,
    ProjetMiseAJourViewSet,
    ProjetTeamViewSet,
    ProjetViewSet,
)

app_name = "projets"

router = DefaultRouter()
router.register("projets", ProjetViewSet, basename="projet")
router.register("meilensteine", MeilensteinViewSet, basename="projet-meilenstein")
router.register("team", ProjetTeamViewSet, basename="projet-team")
router.register("aufgaben", AufgabeViewSet, basename="projet-aufgabe")
router.register("aufgaben-kommentare", AufgabeKommentarViewSet, basename="projet-aufgabe-kommentar")
router.register("plankosten", PlanKostenViewSet, basename="projet-plankosten")
router.register("kosten", ProjetKostenViewSet, basename="projet-kosten")
router.register("aktivitaeten", ProjetAktivitaetViewSet, basename="projet-aktivitaet")
router.register("stellen", StelleViewSet, basename="projet-stelle")
router.register("bewerbungen", BewerbungViewSet, basename="projet-bewerbung")
router.register("images", ProjetImageViewSet, basename="projet-image")
router.register("mises-a-jour", ProjetMiseAJourViewSet, basename="projet-mise-a-jour")
router.register(
    "mises-a-jour-images", ProjetMiseAJourImageViewSet, basename="projet-mise-a-jour-image"
)

urlpatterns = router.urls

from rest_framework.routers import DefaultRouter

from .views import ConfigurationRelanceViewSet, CotisationViewSet

app_name = "cotisations"

router = DefaultRouter()
# Enregistré AVANT le préfixe "" ci-dessous : CotisationViewSet accepte un préfixe vide, dont la
# route de détail (^(?P<pk>[^/.]+)/$) matcherait sinon "configurations-relance" comme un pk.
router.register(
    "configurations-relance", ConfigurationRelanceViewSet, basename="configuration-relance"
)
router.register("", CotisationViewSet, basename="cotisation")

urlpatterns = router.urls

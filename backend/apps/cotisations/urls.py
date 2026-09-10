from rest_framework.routers import DefaultRouter

from .views import CotisationViewSet

app_name = "cotisations"

router = DefaultRouter()
router.register("", CotisationViewSet, basename="cotisation")

urlpatterns = router.urls

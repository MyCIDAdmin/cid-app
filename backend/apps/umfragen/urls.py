from rest_framework.routers import DefaultRouter

from .views import UmfrageViewSet

app_name = "umfragen"

router = DefaultRouter()
router.register("", UmfrageViewSet, basename="umfrage")

urlpatterns = router.urls

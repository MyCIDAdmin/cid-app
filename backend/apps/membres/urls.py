from rest_framework.routers import DefaultRouter

from .views import MembreViewSet

app_name = "membres"

router = DefaultRouter()
router.register("", MembreViewSet, basename="membre")

urlpatterns = router.urls

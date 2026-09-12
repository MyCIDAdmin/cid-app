from rest_framework.routers import DefaultRouter

from .views import VoteSessionViewSet

app_name = "vote"

router = DefaultRouter()
router.register("", VoteSessionViewSet, basename="vote-session")

urlpatterns = router.urls

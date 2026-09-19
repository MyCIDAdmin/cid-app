from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet, ParametresNotificationView

app_name = "notifications"

router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    path(
        "notifications/parametres/",
        ParametresNotificationView.as_view(),
        name="parametres-notification",
    ),
] + router.urls

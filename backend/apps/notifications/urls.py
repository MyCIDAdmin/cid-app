from django.urls import path
from rest_framework.routers import DefaultRouter

from .push_views import PushAboView, PushTestView, PushView
from .telegram_views import (
    TelegramTestView,
    TelegramVerbindenView,
    TelegramView,
    TelegramWebhookView,
)
from .views import NotificationViewSet, ParametresNotificationView

app_name = "notifications"

router = DefaultRouter()
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    # Pas de préfixe "notifications/" ici : ce module est déjà inclus sous
    # api/v1/notifications/ (voir config/urls.py) — contrairement au routeur ci-dessus, dont les
    # endpoints /notifications/notifications/... reprennent volontairement ce préfixe (convention
    # déjà en place, voir frontend/src/api/notifications.ts). Route corrigée le 2026-09-19 : elle
    # pointait par erreur vers /api/v1/notifications/notifications/parametres/ (404 côté client).
    path("push/", PushView.as_view(), name="push"),
    path("push/abo/", PushAboView.as_view(), name="push-abo"),
    path("push/test/", PushTestView.as_view(), name="push-test"),
    path("telegram/", TelegramView.as_view(), name="telegram"),
    path("telegram/verbinden/", TelegramVerbindenView.as_view(), name="telegram-verbinden"),
    path("telegram/test/", TelegramTestView.as_view(), name="telegram-test"),
    path("telegram/webhook/", TelegramWebhookView.as_view(), name="telegram-webhook"),
    path(
        "parametres/",
        ParametresNotificationView.as_view(),
        name="parametres-notification",
    ),
] + router.urls

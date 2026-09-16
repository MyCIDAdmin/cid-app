from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ArticleCatalogueViewSet, ConfigurationRelanceViewSet, CotisationViewSet
from .webhooks import PayPalWebhookView, StripeWebhookView

app_name = "cotisations"

router = DefaultRouter()
# Enregistrés AVANT le préfixe "" ci-dessous : CotisationViewSet accepte un préfixe vide, dont la
# route de détail (^(?P<pk>[^/.]+)/$) matcherait sinon "configurations-relance"/"articles-
# catalogue" comme un pk.
router.register(
    "configurations-relance", ConfigurationRelanceViewSet, basename="configuration-relance"
)
router.register("articles-catalogue", ArticleCatalogueViewSet, basename="article-catalogue")
router.register("", CotisationViewSet, basename="cotisation")

urlpatterns = [
    # Webhooks PSP (AHM-46) : vues Django brutes, pas DRF — voir docstring de webhooks.py. Placés
    # avant `router.urls` pour la même raison que ci-dessus (éviter que la route de détail du
    # router ne les intercepte comme un pk).
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="webhook-stripe"),
    path("webhooks/paypal/", PayPalWebhookView.as_view(), name="webhook-paypal"),
] + router.urls

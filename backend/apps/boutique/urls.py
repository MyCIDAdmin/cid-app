from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CommandeViewSet, ProduitViewSet, RetourViewSet, VarianteProduitViewSet
from .webhooks import PayPalWebhookView, StripeWebhookView

app_name = "boutique"

router = DefaultRouter()
router.register("produits", ProduitViewSet, basename="produit")
router.register("variantes", VarianteProduitViewSet, basename="variante")
router.register("commandes", CommandeViewSet, basename="commande")
router.register("retours", RetourViewSet, basename="retour")

urlpatterns = [
    # Webhooks PSP (ajoutés le 2026-09-17, même principe que apps.cotisations.urls) : vues
    # Django brutes, pas DRF — voir docstring de webhooks.py.
    path("webhooks/stripe/", StripeWebhookView.as_view(), name="webhook-stripe"),
    path("webhooks/paypal/", PayPalWebhookView.as_view(), name="webhook-paypal"),
] + router.urls

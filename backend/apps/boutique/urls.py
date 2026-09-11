from rest_framework.routers import DefaultRouter

from .views import CommandeViewSet, ProduitViewSet, VarianteProduitViewSet

app_name = "boutique"

router = DefaultRouter()
router.register("produits", ProduitViewSet, basename="produit")
router.register("variantes", VarianteProduitViewSet, basename="variante")
router.register("commandes", CommandeViewSet, basename="commande")

urlpatterns = router.urls

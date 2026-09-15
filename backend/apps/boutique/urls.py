from rest_framework.routers import DefaultRouter

from .views import CommandeViewSet, ProduitViewSet, RetourViewSet, VarianteProduitViewSet

app_name = "boutique"

router = DefaultRouter()
router.register("produits", ProduitViewSet, basename="produit")
router.register("variantes", VarianteProduitViewSet, basename="variante")
router.register("commandes", CommandeViewSet, basename="commande")
router.register("retours", RetourViewSet, basename="retour")

urlpatterns = router.urls

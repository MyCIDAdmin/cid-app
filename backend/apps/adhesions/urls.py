from django.urls import path
from rest_framework.routers import DefaultRouter

from .familie_views import FamilienpaketeView, KindDetailView, KinderView
from .views import (
    CampagneAdhesionViewSet,
    JustificatifRabaisViewSet,
    OffreAdhesionViewSet,
    RabaisOffreViewSet,
    SouscriptionViewSet,
)

app_name = "adhesions"

router = DefaultRouter()
router.register("campagnes", CampagneAdhesionViewSet, basename="campagne")
router.register("offres", OffreAdhesionViewSet, basename="offre")
router.register("rabais", RabaisOffreViewSet, basename="rabais")
router.register("souscriptions", SouscriptionViewSet, basename="souscription")
router.register("justificatifs", JustificatifRabaisViewSet, basename="justificatif")

urlpatterns = [
    path("souscriptions/<uuid:pk>/kinder/", KinderView.as_view(), name="familie-kinder"),
    path(
        "souscriptions/<uuid:pk>/kinder/<uuid:kind_pk>/",
        KindDetailView.as_view(),
        name="familie-kind",
    ),
    path("familienpakete/", FamilienpaketeView.as_view(), name="familienpakete"),
    *router.urls,
]

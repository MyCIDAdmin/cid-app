from django.urls import path
from rest_framework.routers import DefaultRouter

from .familie_views import (
    EinladungAblehnenView,
    EinladungAnnehmenView,
    EinladungView,
    ErwachsenerEinladungView,
    ErwachsenerView,
    FamilienpaketeView,
    KindDetailView,
    MeineEinladungenView,
    PersonAngebotView,
)
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
    path(
        "souscriptions/<uuid:pk>/kinder/<uuid:kind_pk>/",
        KindDetailView.as_view(),
        name="familie-kind",
    ),
    path(
        "souscriptions/<uuid:pk>/erwachsene/<uuid:erw_pk>/",
        ErwachsenerView.as_view(),
        name="familie-erwachsener",
    ),
    path(
        "souscriptions/<uuid:pk>/erwachsene/<uuid:erw_pk>/einladung/",
        ErwachsenerEinladungView.as_view(),
        name="familie-einladung-senden",
    ),
    path("familienpakete/", FamilienpaketeView.as_view(), name="familienpakete"),
    path(
        "familienpakete/personen/<str:typ>/<uuid:pk>/",
        PersonAngebotView.as_view(),
        name="familie-person-angebot",
    ),
    path("einladungen/<str:token>/", EinladungView.as_view(), name="einladung"),
    path(
        "einladungen/<str:token>/annehmen/",
        EinladungAnnehmenView.as_view(),
        name="einladung-annehmen",
    ),
    path(
        "einladungen/<str:token>/ablehnen/",
        EinladungAblehnenView.as_view(),
        name="einladung-ablehnen",
    ),
    path("meine-einladungen/", MeineEinladungenView.as_view(), name="meine-einladungen"),
    *router.urls,
]

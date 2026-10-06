from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AbschlussView,
    BudgetView,
    CategorieDepenseViewSet,
    DepenseViewSet,
    ProtokollView,
    PruefungView,
    WiedereroeffnenView,
)

app_name = "finances"

router = DefaultRouter()
router.register("categories", CategorieDepenseViewSet, basename="categorie")
router.register("depenses", DepenseViewSet, basename="depense")

urlpatterns = [
    path("budget/", BudgetView.as_view(), name="budget"),
    path("protokoll/", ProtokollView.as_view(), name="protokoll"),
    path("abschluss/", AbschlussView.as_view(), name="abschluss"),
    path("abschluss/wiedereroeffnen/", WiedereroeffnenView.as_view(), name="wiedereroeffnen"),
    path("pruefung/", PruefungView.as_view(), name="pruefung"),
    *router.urls,
]

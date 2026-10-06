from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BudgetView, CategorieDepenseViewSet, DepenseViewSet

app_name = "finances"

router = DefaultRouter()
router.register("categories", CategorieDepenseViewSet, basename="categorie")
router.register("depenses", DepenseViewSet, basename="depense")

urlpatterns = [path("budget/", BudgetView.as_view(), name="budget"), *router.urls]

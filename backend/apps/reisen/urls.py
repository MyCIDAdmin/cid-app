from django.urls import path
from rest_framework.routers import DefaultRouter

from .oeffentlich import ReiseOeffentlichView, ReiseTeilenView
from .views import ReiseViewSet

app_name = "reisen"

router = DefaultRouter()
router.register("", ReiseViewSet, basename="reise")

urlpatterns = [
    path("oeffentlich/<uuid:pk>/", ReiseOeffentlichView.as_view(), name="oeffentlich"),
    path("oeffentlich/<uuid:pk>/teilen/", ReiseTeilenView.as_view(), name="teilen"),
    *router.urls,
]

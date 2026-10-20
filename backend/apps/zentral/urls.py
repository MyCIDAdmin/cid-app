from django.urls import path

from .views import HinweiseView, ZentraleEinstellungenView

app_name = "zentral"

urlpatterns = [
    path("einstellungen/", ZentraleEinstellungenView.as_view(), name="einstellungen"),
    path("hinweise/", HinweiseView.as_view(), name="hinweise"),
]

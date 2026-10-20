from django.urls import path

from .views import ZentraleEinstellungenView

app_name = "zentral"

urlpatterns = [
    path("einstellungen/", ZentraleEinstellungenView.as_view(), name="einstellungen"),
]

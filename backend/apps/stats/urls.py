from django.urls import path

from .views import StatsEvenementsView, StatsFinancierView, StatsMembresView

app_name = "stats"

urlpatterns = [
    path("financier/", StatsFinancierView.as_view(), name="financier"),
    path("membres/", StatsMembresView.as_view(), name="membres"),
    path("evenements/", StatsEvenementsView.as_view(), name="evenements"),
]

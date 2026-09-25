from django.urls import path

from .views import (
    StatsEvenementsView,
    StatsExportExcelView,
    StatsExportPdfView,
    StatsFinancesView,
    StatsFinancierView,
    StatsMembresView,
)

app_name = "stats"

urlpatterns = [
    path("financier/", StatsFinancierView.as_view(), name="financier"),
    path("membres/", StatsMembresView.as_view(), name="membres"),
    path("evenements/", StatsEvenementsView.as_view(), name="evenements"),
    path("finances/", StatsFinancesView.as_view(), name="finances"),
    path("export/excel/", StatsExportExcelView.as_view(), name="export-excel"),
    path("export/pdf/", StatsExportPdfView.as_view(), name="export-pdf"),
]

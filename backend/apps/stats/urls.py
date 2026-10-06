from django.urls import path

from .views import (
    StatsBilanView,
    StatsEvenementsView,
    StatsExportBilanExcelView,
    StatsExportBilanPdfView,
    StatsExportBuchungenCsvView,
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
    path("bilan/", StatsBilanView.as_view(), name="bilan"),
    path("export/bilan-excel/", StatsExportBilanExcelView.as_view(), name="export-bilan-excel"),
    path("export/bilan-pdf/", StatsExportBilanPdfView.as_view(), name="export-bilan-pdf"),
    path(
        "export/buchungen-csv/", StatsExportBuchungenCsvView.as_view(), name="export-buchungen-csv"
    ),
    path("export/excel/", StatsExportExcelView.as_view(), name="export-excel"),
    path("export/pdf/", StatsExportPdfView.as_view(), name="export-pdf"),
]

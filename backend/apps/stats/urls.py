from django.urls import path

from .views import (
    StatsBilanView,
    StatsEvenementsView,
    StatsExportBilanExcelView,
    StatsExportBilanPdfView,
    StatsExportBuchungenCsvView,
    StatsExportExcelView,
    StatsExportPdfView,
    StatsExportPivotView,
    StatsFinancesView,
    StatsFinancierView,
    StatsMembresView,
    StatsPivotView,
    StatsProjetsView,
)

app_name = "stats"

urlpatterns = [
    path("financier/", StatsFinancierView.as_view(), name="financier"),
    path("membres/", StatsMembresView.as_view(), name="membres"),
    path("evenements/", StatsEvenementsView.as_view(), name="evenements"),
    path("projets/", StatsProjetsView.as_view(), name="projets"),
    path("finances/", StatsFinancesView.as_view(), name="finances"),
    path("pivot/", StatsPivotView.as_view(), name="pivot"),
    path("export/pivot/", StatsExportPivotView.as_view(), name="export-pivot"),
    path("bilan/", StatsBilanView.as_view(), name="bilan"),
    path("export/bilan-excel/", StatsExportBilanExcelView.as_view(), name="export-bilan-excel"),
    path("export/bilan-pdf/", StatsExportBilanPdfView.as_view(), name="export-bilan-pdf"),
    path(
        "export/buchungen-csv/", StatsExportBuchungenCsvView.as_view(), name="export-buchungen-csv"
    ),
    path("export/excel/", StatsExportExcelView.as_view(), name="export-excel"),
    path("export/pdf/", StatsExportPdfView.as_view(), name="export-pdf"),
]

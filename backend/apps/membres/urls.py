from django.urls import path
from rest_framework.routers import DefaultRouter

from .export_views import MembreExportView
from .import_views import (
    HistoriqueStatutImportTemplateView,
    HistoriqueStatutImportView,
    MembreImportTemplateView,
    MembreImportView,
)
from .reporting_views import (
    AktivitaetenReportingView,
    MitgliederReportingExportView,
    MitgliederReportingView,
)
from .views import MembreViewSet

app_name = "membres"

router = DefaultRouter()
router.register("", MembreViewSet, basename="membre")

# "import/", "import/template/", "import-historique/", "import-historique/template/" et
# "export/" doivent être déclarés AVANT les routes du router : le lookup par défaut de
# MembreViewSet (`/membres/{pk}/`) utilise le regex générique DRF [^/.]+, qui matcherait aussi
# ces chaînes littérales comme un pk. Django résout les urlpatterns dans l'ordre — ces chemins
# explicites gagnent.
urlpatterns = [
    path("import/", MembreImportView.as_view(), name="membre-import"),
    path("import/template/", MembreImportTemplateView.as_view(), name="membre-import-template"),
    path(
        "import-historique/",
        HistoriqueStatutImportView.as_view(),
        name="membre-import-historique",
    ),
    path(
        "import-historique/template/",
        HistoriqueStatutImportTemplateView.as_view(),
        name="membre-import-historique-template",
    ),
    path("export/", MembreExportView.as_view(), name="membre-export"),
    path("reporting/mitglieder/", MitgliederReportingView.as_view(), name="membre-reporting"),
    path(
        "reporting/aktivitaeten/",
        AktivitaetenReportingView.as_view(),
        name="membre-reporting-aktivitaeten",
    ),
    path(
        "reporting/export/",
        MitgliederReportingExportView.as_view(),
        name="membre-reporting-export",
    ),
] + router.urls

from django.urls import path
from rest_framework.routers import DefaultRouter

from .import_views import MembreImportTemplateView, MembreImportView
from .views import MembreViewSet

app_name = "membres"

router = DefaultRouter()
router.register("", MembreViewSet, basename="membre")

# "import/" et "import/template/" doivent être déclarés AVANT les routes du
# router : le lookup par défaut de MembreViewSet (`/membres/{pk}/`) utilise
# le regex générique DRF [^/.]+, qui matcherait aussi la chaîne littérale
# "import" comme un pk. Django résout les urlpatterns dans l'ordre — ces
# chemins explicites gagnent.
urlpatterns = [
    path("import/", MembreImportView.as_view(), name="membre-import"),
    path("import/template/", MembreImportTemplateView.as_view(), name="membre-import-template"),
] + router.urls

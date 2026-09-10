from django.urls import path
from rest_framework.routers import DefaultRouter

from .import_views import MembreImportView
from .views import MembreViewSet

app_name = "membres"

router = DefaultRouter()
router.register("", MembreViewSet, basename="membre")

# "import/" doit être déclaré AVANT les routes du router : le lookup par
# défaut de MembreViewSet (`/membres/{pk}/`) utilise le regex générique DRF
# [^/.]+, qui matcherait aussi la chaîne littérale "import" comme un pk.
# Django résout les urlpatterns dans l'ordre — ce chemin explicite gagne.
urlpatterns = [
    path("import/", MembreImportView.as_view(), name="membre-import"),
] + router.urls

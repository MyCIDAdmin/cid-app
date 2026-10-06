from django.urls import path

from .views import UebersetzungNeuView, UebersetzungObjektView, UebersetzungStatusView

app_name = "uebersetzung"

urlpatterns = [
    path("status/", UebersetzungStatusView.as_view(), name="status"),
    path("<str:modell>/<str:pk>/neu/", UebersetzungNeuView.as_view(), name="neu"),
    path("<str:modell>/<str:pk>/", UebersetzungObjektView.as_view(), name="objekt"),
]

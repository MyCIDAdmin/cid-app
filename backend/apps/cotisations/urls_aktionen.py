from django.urls import path

from .aktionen_oeffentlich import AktionOeffentlichView, AktionTeilenView

app_name = "aktionen"

urlpatterns = [
    path("<uuid:pk>/", AktionOeffentlichView.as_view(), name="oeffentlich"),
    path("<uuid:pk>/teilen/", AktionTeilenView.as_view(), name="teilen"),
]

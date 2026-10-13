from django.urls import path

from .views import OeffentlichView

app_name = "kalender_oeffentlich"

urlpatterns = [path("", OeffentlichView.as_view(), name="liste")]

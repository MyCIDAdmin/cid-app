from django.urls import path

from . import views

urlpatterns = [
    path("meine/", views.MeineTicketsView.as_view()),
    path("<uuid:pk>/senden/", views.TicketSendenView.as_view()),
    path("<uuid:pk>/erneuern/", views.TicketErneuernView.as_view()),
]

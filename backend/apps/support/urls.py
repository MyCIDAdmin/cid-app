from django.urls import path

from . import views

urlpatterns = [
    path("faq/", views.FaqView.as_view()),
    path("faq/verwaltung/", views.FaqVerwaltungView.as_view()),
    path("faq/<int:pk>/", views.FaqDetailView.as_view()),
    path("tickets/", views.TicketsView.as_view()),
    path("tickets/<int:pk>/", views.TicketDetailView.as_view()),
    path("tickets/<int:pk>/nachrichten/", views.TicketNachrichtView.as_view()),
]

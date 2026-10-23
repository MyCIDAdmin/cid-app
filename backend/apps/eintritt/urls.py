from django.urls import path

from . import einlass_views, views

urlpatterns = [
    path("einlass/meine/", einlass_views.MeineEinlassView.as_view()),
    path("einlass/ruecknahme/<uuid:pk>/", einlass_views.EinlassRuecknahmeView.as_view()),
    path("einlass/<str:typ>/<uuid:pk>/", einlass_views.EinlassUebersichtView.as_view()),
    path("einlass/<str:typ>/<uuid:pk>/pruefen/", einlass_views.EinlassPruefenView.as_view()),
    path("einlass/<str:typ>/<uuid:pk>/einlassen/", einlass_views.EinlassBuchenView.as_view()),
    path("einlass/<str:typ>/<uuid:pk>/helfer/", einlass_views.EinlassHelferView.as_view()),
    path(
        "einlass/<str:typ>/<uuid:pk>/helfer/<uuid:helfer_id>/",
        einlass_views.EinlassHelferLoeschenView.as_view(),
    ),
    path("meine/", views.MeineTicketsView.as_view()),
    path("<uuid:pk>/senden/", views.TicketSendenView.as_view()),
    path("<uuid:pk>/erneuern/", views.TicketErneuernView.as_view()),
]

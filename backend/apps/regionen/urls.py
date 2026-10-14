from django.urls import path

from .views import (
    BannerView,
    BeitraegeView,
    BeitragAusblendenView,
    BeitragBildView,
    BeitragDetailView,
    BeitragReaktionView,
    PersonenSucheView,
    RegionDetailView,
    RegionListeView,
    VerantwortlicherDetailView,
    VerantwortlicherFotoView,
    VerantwortlicheView,
    VerwaltungDetailView,
    VerwaltungLaenderView,
    VerwaltungListeView,
    VerwaltungStandortListeView,
    VerwaltungStandortView,
)

app_name = "regionen"

urlpatterns = [
    path("", RegionListeView.as_view(), name="liste"),
    path("personen/", PersonenSucheView.as_view(), name="personen"),
    path("verwaltung/", VerwaltungListeView.as_view(), name="verwaltung"),
    path("verwaltung/standorte/<uuid:pk>/", VerwaltungStandortView.as_view(), name="standort"),
    path("verwaltung/<uuid:pk>/", VerwaltungDetailView.as_view(), name="verwaltung-detail"),
    path("verwaltung/<uuid:pk>/laender/", VerwaltungLaenderView.as_view(), name="laender"),
    path(
        "verwaltung/<uuid:pk>/standorte/",
        VerwaltungStandortListeView.as_view(),
        name="standort-neu",
    ),
    path("<slug:slug>/", RegionDetailView.as_view(), name="detail"),
    path("<slug:slug>/banner/", BannerView.as_view(), name="banner"),
    path("<slug:slug>/beitraege/", BeitraegeView.as_view(), name="beitraege"),
    path("<slug:slug>/beitraege/<uuid:pk>/", BeitragDetailView.as_view(), name="beitrag"),
    path("<slug:slug>/beitraege/<uuid:pk>/bild/", BeitragBildView.as_view(), name="beitrag-bild"),
    path(
        "<slug:slug>/beitraege/<uuid:pk>/ausblenden/",
        BeitragAusblendenView.as_view(),
        name="beitrag-ausblenden",
    ),
    path(
        "<slug:slug>/beitraege/<uuid:pk>/reaktion/",
        BeitragReaktionView.as_view(),
        name="beitrag-reaktion",
    ),
    path("<slug:slug>/verantwortliche/", VerantwortlicheView.as_view(), name="verantwortliche"),
    path(
        "<slug:slug>/verantwortliche/<uuid:pk>/",
        VerantwortlicherDetailView.as_view(),
        name="verantwortlicher",
    ),
    path(
        "<slug:slug>/verantwortliche/<uuid:pk>/foto/",
        VerantwortlicherFotoView.as_view(),
        name="verantwortlicher-foto",
    ),
]

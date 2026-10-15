from django.urls import path

from .fan import FanOptionenView, FanProfilView, FanRegistrierenView, MitgliedWerdenView
from .veranstaltungen import (
    AnmeldungView,
    AnwesenheitView,
    OeffentlichView,
    TeilnehmerView,
    VeranstaltungAktionView,
    VeranstaltungBildView,
    VeranstaltungDetailView,
    VeranstaltungenView,
    ZurFreigabeView,
)
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
    path("fan/", FanProfilView.as_view(), name="fan"),
    path("fan/optionen/", FanOptionenView.as_view(), name="fan-optionen"),
    path("fan/registrieren/", FanRegistrierenView.as_view(), name="fan-registrieren"),
    path("fan/mitglied-werden/", MitgliedWerdenView.as_view(), name="fan-mitglied-werden"),
    path("veranstaltungen/zur-freigabe/", ZurFreigabeView.as_view(), name="zur-freigabe"),
    path("public/veranstaltungen/<uuid:pk>/", OeffentlichView.as_view(), name="oeffentlich"),
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
    path("<slug:slug>/veranstaltungen/", VeranstaltungenView.as_view(), name="veranstaltungen"),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/",
        VeranstaltungDetailView.as_view(),
        name="veranstaltung",
    ),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/bild/",
        VeranstaltungBildView.as_view(),
        name="veranstaltung-bild",
    ),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/aktion/",
        VeranstaltungAktionView.as_view(),
        name="veranstaltung-aktion",
    ),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/anmeldung/",
        AnmeldungView.as_view(),
        name="veranstaltung-anmeldung",
    ),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/teilnehmer/",
        TeilnehmerView.as_view(),
        name="veranstaltung-teilnehmer",
    ),
    path(
        "<slug:slug>/veranstaltungen/<uuid:pk>/teilnehmer/<uuid:user_id>/",
        AnwesenheitView.as_view(),
        name="veranstaltung-anwesenheit",
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

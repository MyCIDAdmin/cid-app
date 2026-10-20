"""Alben (Wunsch 2026-10-21): Freischalten für die öffentliche Startseite, Verknüpfung mit
Veranstaltung/Projekt. Besucher ohne Anmeldung sehen nur freigeschaltete Alben und deren
Fotos — ohne Kommentare (Namen von Mitgliedern)."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.tests.factories import AlbumFactory, PhotoCommentaireFactory, PhotoFactory
from apps.evenements.tests.factories import EvenementFactory
from apps.membres.tests.factories import MembreFactory
from apps.projets.tests.factories import ProjetFactory

pytestmark = pytest.mark.django_db

ALBUM_LIST = "communaute:album-list"
ALBUM_DETAIL = "communaute:album-detail"
PHOTO_LIST = "communaute:photo-list"


def _admin():
    user = User.objects.create_user(
        email="albadmin@example.de", password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )
    MembreFactory(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _mitglied():
    user = User.objects.create_user(
        email="albmitglied@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    MembreFactory(user=user)
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def test_neues_album_ist_standardmaessig_nicht_oeffentlich():
    assert AlbumFactory().oeffentlich is False


def test_besucher_sehen_nur_freigeschaltete_alben():
    sichtbar = AlbumFactory(oeffentlich=True)
    versteckt = AlbumFactory(oeffentlich=False)

    ids = {a["id"] for a in APIClient().get(reverse(ALBUM_LIST)).data["results"]}

    assert str(sichtbar.id) in ids
    assert str(versteckt.id) not in ids
    assert APIClient().get(reverse(ALBUM_DETAIL, args=[sichtbar.id])).status_code == 200
    assert APIClient().get(reverse(ALBUM_DETAIL, args=[versteckt.id])).status_code == 404


def test_mitglieder_sehen_alle_alben():
    AlbumFactory(oeffentlich=False)
    AlbumFactory(oeffentlich=True)

    assert len(_mitglied().get(reverse(ALBUM_LIST)).data["results"]) == 2


def test_besucher_sehen_nur_fotos_freigeschalteter_alben_ohne_kommentare():
    oeffentlich = AlbumFactory(oeffentlich=True)
    privat = AlbumFactory(oeffentlich=False)
    foto = PhotoFactory(album=oeffentlich)
    PhotoFactory(album=privat)
    PhotoCommentaireFactory(photo=foto)

    daten = APIClient().get(reverse(PHOTO_LIST)).data["results"]

    assert [f["id"] for f in daten] == [str(foto.id)]
    assert daten[0]["commentaires"] == []
    # Mitglieder sehen die Kommentare weiterhin.
    mitglied = _mitglied().get(reverse(PHOTO_LIST), {"album": str(oeffentlich.id)}).data["results"]
    assert len(mitglied[0]["commentaires"]) == 1


def test_verwaltung_schaltet_frei_und_verknuepft_veranstaltung_und_projekt():
    album = AlbumFactory()
    evenement = EvenementFactory()
    projekt = ProjetFactory()
    client = _admin()

    resp = client.patch(
        reverse(ALBUM_DETAIL, args=[album.id]),
        {
            "oeffentlich": True,
            "evenement_id": str(evenement.id),
            "projet_id": str(projekt.id),
        },
        format="json",
    )

    assert resp.status_code == 200
    assert resp.data["oeffentlich"] is True
    assert resp.data["evenement"] == {"id": str(evenement.id), "titre": evenement.titre}
    assert resp.data["projet"] == {"id": str(projekt.id), "titre": projekt.titre}

    resp = client.patch(
        reverse(ALBUM_DETAIL, args=[album.id]),
        {"evenement_id": None, "projet_id": None},
        format="json",
    )
    assert resp.data["evenement"] is None
    assert resp.data["projet"] is None


def test_mitglied_darf_weder_freischalten_noch_verknuepfen():
    album = AlbumFactory()

    resp = _mitglied().patch(
        reverse(ALBUM_DETAIL, args=[album.id]), {"oeffentlich": True}, format="json"
    )

    assert resp.status_code == 403
    album.refresh_from_db()
    assert album.oeffentlich is False


def test_ungueltige_verknuepfung_wird_abgelehnt():
    album = AlbumFactory()

    resp = _admin().patch(
        reverse(ALBUM_DETAIL, args=[album.id]), {"projet_id": "Album"}, format="json"
    )

    assert resp.status_code == 400

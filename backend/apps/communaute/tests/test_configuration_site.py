"""Tests — ConfigurationSitePublic (vidéo de fond du hero de la page d'accueil publique,
demande utilisateur du 2026-09-27, Phase 5 "Startseite Hero-Video"). Voir docstring de
ConfigurationSitePublicPermission (models.py) pour le choix de rester hors matrice apps.rbac."""

import base64
import io

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.communaute.models import ConfigurationSitePublic
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db

CONFIGURATION_SITE_URL = "communaute:configuration-site-public"

# Vidéo MP4 valide minimale (32x32px, 1s, H.264), générée via ffmpeg pour ce test — même principe
# qu'une image PIL générée à la volée dans test_api.py, mais un encodeur vidéo n'a pas
# d'équivalent "génère 2 octets et une extension" : les octets réels (magic bytes ISO BMFF/ftyp)
# sont nécessaires pour que `valider_video_hero` (détection MIME réelle, pas l'extension) accepte
# le fichier.
_VIDEO_MP4_B64 = (
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAARlbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAA"
    "AAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA490cmFrAAAAXHRraGQAAAADAAAAAAAAAAAA"
    "AAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABA"
    "AAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAEAAABAAAAAAMHbWRpYQAAACBt"
    "ZGhkAAAAAAAAAAAAAAAAAAAyAAAAMgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABW"
    "aWRlb0hhbmRsZXIAAAACsm1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAA"
    "AAAAAQAAAAx1cmwgAAAAAQAAAnJzdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAA"
    "AAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAA"
    "AAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2UlsBEAAAAMAQAAADIPEiWWAAQAGaOvjyyLA/fj4AAAA"
    "ABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAACCoAAAgqAAAABhzdHRzAAAAAAAAAAEAAAAZAAACAAAA"
    "ABRzdHNzAAAAAAAAAAEAAAABAAAA2GN0dHMAAAAAAAAAGQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAA"
    "AAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAAAEAAAoAAAAAAQAA"
    "BAAAAAABAAAAAAAAAAEAAAIAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAA"
    "AAEAAAQAAAAAAQAAAAAAAAABAAACAAAAABxzdHNjAAAAAAAAAAEAAAABAAAAGQAAAAEAAAB4c3RzegAA"
    "AAAAAAAAAAAAGQAAAsoAAAANAAAADAAAAAwAAAAMAAAAEwAAAA4AAAAMAAAADAAAABMAAAAOAAAADAAA"
    "AAwAAAASAAAADgAAAAwAAAAMAAAAEgAAAA4AAAAMAAAADAAAABJzdGNvAAAAAAAAAAEAAASVAAAAYnVk"
    "dGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWp"
    "dG9vAAAAHWRhdGEAAAABAAAAAExhdmY2MC4xNi4xMDAAAAAIZnJlZQAABB1tZGF0AAACrgYF//+q3EXp"
    "vebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NCByMzEwOCAzMWUxOWY5IC0gSC4yNjQvTVBFRy00IEFW"
    "QyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQu"
    "aHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEx"
    "MyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3Jhbmdl"
    "PTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0"
    "X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBz"
    "bGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0w"
    "IGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9"
    "MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRf"
    "bWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1i"
    "dHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRp"
    "bz0xLjQwIGFxPTE6MS4wMACAAAAAFGWIhAA7//73Tr8Cm1TCKgNYle7xAAAACUGaJGxDv/6rgAAAAAhB"
    "nkJ4hf9VwQAAAAgBnmF0Qr9awAAAAAgBnmNqQr9awQAAAA9BmmhJqEFomUwId//+q4EAAAAKQZ6GRREs"
    "L/9VwQAAAAgBnqV0Qr9awQAAAAgBnqdqQr9awAAAAA9BmqxJqEFsmUwId//+q4AAAAAKQZ7KRRUsL/9V"
    "wQAAAAgBnul0Qr9awAAAAAgBnutqQr9awAAAAA5BmvBJqEFsmUwIb//+qwAAAApBnw5FFSwv/1XBAAAA"
    "CAGfLXRCv1rBAAAACAGfL2pCv1rAAAAADkGbNEmoQWyZTAhn//6nAAAACkGfUkUVLC//VcEAAAAIAZ9x"
    "dEK/WsAAAAAIAZ9zakK/WsAAAAAOQZt4SahBbJlMCFf//lcAAAAKQZ+WRRUsL/9VwAAAAAgBn7V0Qr9a"
    "wQAAAAgBn7dqQr9awQ=="
)


def _video_mp4_upload(name="hero.mp4"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, base64.b64decode(_VIDEO_MP4_B64), content_type="video/mp4")


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def test_get_non_authentifie_autorise(api_client):
    """AllowAny — la page d'accueil publique (visiteur anonyme inclus) doit pouvoir récupérer
    la configuration (URL de la vidéo, éventuellement None si jamais configurée)."""
    resp = api_client.get(reverse(CONFIGURATION_SITE_URL))
    assert resp.status_code == 200
    assert resp.data["video_hero"] is None


def test_get_cree_le_singleton_a_la_premiere_lecture(api_client):
    assert ConfigurationSitePublic.objects.count() == 0
    api_client.get(reverse(CONFIGURATION_SITE_URL))
    assert ConfigurationSitePublic.objects.count() == 1


def test_patch_non_authentifie_refuse(api_client):
    resp = api_client.patch(
        reverse(CONFIGURATION_SITE_URL), {"video_hero": _video_mp4_upload()}, format="multipart"
    )
    assert resp.status_code in (401, 403)
    assert ConfigurationSitePublic.get_solo().video_hero.name in (None, "")


def test_patch_simple_membre_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "membre-hero@example.de")
    resp = _auth(api_client, user).patch(
        reverse(CONFIGURATION_SITE_URL), {"video_hero": _video_mp4_upload()}, format="multipart"
    )
    assert resp.status_code == 403
    assert ConfigurationSitePublic.get_solo().video_hero.name in (None, "")


def test_patch_bureau_admin_televerse_la_video(api_client):
    user, membre = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-hero@example.de")
    resp = _auth(api_client, user).patch(
        reverse(CONFIGURATION_SITE_URL), {"video_hero": _video_mp4_upload()}, format="multipart"
    )
    assert resp.status_code == 200
    assert resp.data["video_hero"]

    configuration = ConfigurationSitePublic.get_solo()
    assert configuration.video_hero.name
    assert configuration.modifie_par_id == membre.id


def test_patch_refuse_un_fichier_non_video(api_client):
    """Détection MIME réelle (magic bytes), jamais l'extension déclarée par le client — même
    principe que valider_et_reencoder_photo/valider_document_pdf."""
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-hero2@example.de")
    faux_fichier = io.BytesIO(b"pas une vraie video")
    faux_fichier.name = "malware.mp4"
    resp = _auth(api_client, user).patch(
        reverse(CONFIGURATION_SITE_URL),
        {"video_hero": faux_fichier},
        format="multipart",
    )
    assert resp.status_code == 400


def test_patch_refuse_un_fichier_trop_volumineux(api_client, settings):
    from apps.communaute import validators as communaute_validators

    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-hero3@example.de")
    original_max = communaute_validators.MAX_VIDEO_SIZE_BYTES
    communaute_validators.MAX_VIDEO_SIZE_BYTES = 1  # tout fichier réel dépasse cette limite
    try:
        resp = _auth(api_client, user).patch(
            reverse(CONFIGURATION_SITE_URL),
            {"video_hero": _video_mp4_upload()},
            format="multipart",
        )
        assert resp.status_code == 400
    finally:
        communaute_validators.MAX_VIDEO_SIZE_BYTES = original_max

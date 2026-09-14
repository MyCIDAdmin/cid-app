"""
Tests — apps.communaute.storage.PublicationsStorage.

Même régression que apps.boutique.tests.test_storage (voir sa docstring) : sans
`MINIO_PUBLIC_ENDPOINT`, l'URL générée pointe vers l'endpoint MinIO INTERNE, jamais
joignable depuis le navigateur — "icône image cassée" pour les photos du fil.
"""

from django.test import override_settings

from apps.communaute.storage import AlbumsStorage, PublicationsStorage


def test_url_utilise_lendpoint_interne_sans_endpoint_public_configure(settings):
    settings.MINIO_PUBLIC_ENDPOINT = ""
    storage = PublicationsStorage()
    assert storage.custom_domain is None


@override_settings(
    MINIO_PUBLIC_ENDPOINT="cid-media-production.up.railway.app",
    MINIO_PUBLIC_USE_SSL=True,
)
def test_url_utilise_lendpoint_public_quand_configure():
    storage = PublicationsStorage()
    url = storage.url("fil/abc123/photo.jpg")
    assert url == "https://cid-media-production.up.railway.app/cid-media/fil/abc123/photo.jpg"


@override_settings(MINIO_PUBLIC_ENDPOINT="localhost:9000", MINIO_PUBLIC_USE_SSL=False)
def test_url_publique_sans_ssl_en_http():
    storage = PublicationsStorage()
    url = storage.url("fil/abc123/photo.jpg")
    assert url.startswith("http://localhost:9000/cid-media/")


# --- AlbumsStorage (Phase 4B) — même bucket/mêmes réglages que PublicationsStorage, voir
# storage.py --------------------------------------------------------------------------


@override_settings(
    MINIO_PUBLIC_ENDPOINT="cid-media-production.up.railway.app",
    MINIO_PUBLIC_USE_SSL=True,
)
def test_albums_storage_utilise_le_meme_bucket_et_endpoint_public():
    storage = AlbumsStorage()
    url = storage.url("albums/abc123/def456/photo.jpg")
    assert url == (
        "https://cid-media-production.up.railway.app/cid-media/albums/abc123/def456/photo.jpg"
    )

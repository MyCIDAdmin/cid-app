"""
Tests — apps.boutique.storage.ProduitsStorage.

Régression : les images produit s'affichaient en "icône cassée" côté navigateur après
publication, car l'URL générée par django-storages utilisait l'endpoint MinIO INTERNE
(settings.MINIO_ENDPOINT — ex. `<service>.railway.internal:9000` sur Railway), jamais
joignable depuis l'extérieur. `MINIO_PUBLIC_ENDPOINT` doit produire une URL utilisant
`custom_domain` (endpoint public) au lieu de l'endpoint interne — voir storage.py.
"""

from django.test import override_settings

from apps.boutique.storage import ProduitsStorage


def test_url_utilise_lendpoint_interne_sans_endpoint_public_configure(settings):
    settings.MINIO_PUBLIC_ENDPOINT = ""
    storage = ProduitsStorage()
    assert storage.custom_domain is None


@override_settings(
    MINIO_PUBLIC_ENDPOINT="cid-media-production.up.railway.app",
    MINIO_PUBLIC_USE_SSL=True,
    MINIO_BUCKET_PRODUITS="produits",
)
def test_url_utilise_lendpoint_public_quand_configure():
    storage = ProduitsStorage()
    url = storage.url("abc123/maillot.jpg")
    assert url == "https://cid-media-production.up.railway.app/produits/abc123/maillot.jpg"


@override_settings(
    MINIO_PUBLIC_ENDPOINT="localhost:9000",
    MINIO_PUBLIC_USE_SSL=False,
    MINIO_BUCKET_PRODUITS="produits",
)
def test_url_publique_sans_ssl_en_http():
    storage = ProduitsStorage()
    url = storage.url("abc123/maillot.jpg")
    assert url.startswith("http://localhost:9000/produits/")

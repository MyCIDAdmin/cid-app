"""
Tests unitaires — apps.adhesions.storage.JustificatifsStorage.url() (retour utilisateur du
2026-09-16 : "voir le document" ouvrait `minio.railway.internal`, injoignable depuis le
navigateur — DNS_PROBE_FINISHED_NXDOMAIN).

Instancie JustificatifsStorage() directement plutôt que via JustificatifRabais.fichier, dont
le storage est remplacé par un FileSystemStorage local pour tous les autres tests de ce module
(voir conftest.py — _justificatifs_storage_local). generate_presigned_url() est un calcul
purement local (aucun appel réseau à MinIO), donc testable sans serveur MinIO réel.
"""

from urllib.parse import urlparse

from django.conf import settings
from django.test import override_settings

from apps.adhesions.storage import JustificatifsStorage


def test_url_sans_endpoint_public_utilise_l_hote_interne_par_defaut():
    """Comportement django-storages inchangé quand MINIO_PUBLIC_ENDPOINT n'est pas défini
    (dev local — l'endpoint interne y est déjà joignable, voir docker-compose.yml)."""
    storage = JustificatifsStorage()
    with override_settings(MINIO_PUBLIC_ENDPOINT=""):
        url = storage.url("s1/justificatif.pdf")

    assert urlparse(url).hostname == urlparse(settings.AWS_S3_ENDPOINT_URL).hostname


def test_url_avec_endpoint_public_pointe_vers_l_hote_public_et_reste_signee():
    """Le bug : sans le correctif, cet hôte serait celui d'AWS_S3_ENDPOINT_URL (interne,
    ex. Railway `minio.railway.internal`), jamais résolvable par un navigateur."""
    storage = JustificatifsStorage()
    with override_settings(
        MINIO_PUBLIC_ENDPOINT="minio-public.example.com",
        MINIO_PUBLIC_USE_SSL=True,
    ):
        url = storage.url("s1/justificatif.pdf")

    parsed = urlparse(url)
    assert parsed.hostname == "minio-public.example.com"
    assert parsed.scheme == "https"
    # Toujours une URL pré-signée (le projet ne fixe pas AWS_S3_SIGNATURE_VERSION,
    # donc boto3/MinIO utilisent ici la signature "v2" par défaut — mêmes paramètres
    # que l'endpoint interne, voir test_url_sans_endpoint_public_...) — jamais une
    # simple concaténation d'URL non signée comme le produirait `custom_domain` seul
    # (voir docstring de storage.py) : ça casserait l'accès à ce bucket privé (403
    # MinIO) au lieu de le réparer.
    query = parsed.query
    assert "Signature=" in query
    assert "Expires=" in query


def test_url_publique_http_quand_minio_public_use_ssl_absent():
    storage = JustificatifsStorage()
    with override_settings(
        MINIO_PUBLIC_ENDPOINT="minio-public.example.com", MINIO_PUBLIC_USE_SSL=False
    ):
        url = storage.url("s1/justificatif.pdf")

    assert urlparse(url).scheme == "http"


def test_url_respecte_le_ttl_de_15_minutes(monkeypatch):
    """Le TTL (FDD §9, 15 min) doit rester respecté même en passant par l'endpoint public —
    voir la valeur `expire` transmise à generate_presigned_url."""
    captured = {}
    storage = JustificatifsStorage()

    with override_settings(
        MINIO_PUBLIC_ENDPOINT="minio-public.example.com", MINIO_PUBLIC_USE_SSL=True
    ):
        original_create_session = storage._create_session

        def _create_session_spy():
            session = original_create_session()
            original_resource = session.resource

            def resource_spy(*args, **kwargs):
                res = original_resource(*args, **kwargs)
                original_generate = res.meta.client.generate_presigned_url

                def generate_presigned_url_spy(*a, **kw):
                    captured.update(kw)
                    return original_generate(*a, **kw)

                monkeypatch.setattr(
                    res.meta.client, "generate_presigned_url", generate_presigned_url_spy
                )
                return res

            session.resource = resource_spy
            return session

        monkeypatch.setattr(storage, "_create_session", _create_session_spy)
        storage.url("s1/justificatif.pdf")

    assert captured.get("ExpiresIn") == 900

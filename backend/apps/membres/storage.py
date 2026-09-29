"""
Storage MinIO dédié aux photos de profil des membres (retour utilisateur du 2026-09-28,
point 2.2 "zu dem Profile darf der User sein Bild hochladen") — réutilise le bucket "défaut"
(MINIO_BUCKET_DEFAULT="cid-media", voir settings/base.py), même principe que
apps.communaute.storage.PublicationsStorage/AlbumsStorage : ces photos ont le même profil de
visibilité (montrées à tout membre authentifié dans l'app — menu utilisateur, future fiche
membre — jamais de donnée sensible au sens SCD §5.1, à la différence des pièces d'identité
cin/passeport qui restent des EncryptedCharField, jamais des fichiers) — pas de raison
opérationnelle de provisionner un bucket MinIO supplémentaire.

Bug corrigé le 2026-09-29 (retour utilisateur : la photo ne s'affiche pas après l'upload sur
/mon-profil, DevTools montre une requête vers `minio.railway.internal`, DNS_PROBE_FINISHED
_NXDOMAIN) : `Membre.photo` utilisait `STORAGES["default"]` (django-storages) sans
`custom_domain` — même piège que ProduitsStorage/PublicationsStorage/EvenementsStorage/
ProjetsStorage (voir leurs docstrings) : `AWS_S3_ENDPOINT_URL` (settings.MINIO_ENDPOINT) est
l'endpoint INTERNE que le backend utilise pour parler à MinIO (Railway :
`<service>.railway.internal:9000`, jamais résolvable hors du réseau privé Railway — voir
docs/RAILWAY.md §7), jamais joignable depuis le navigateur d'un membre. `MINIO_PUBLIC_ENDPOINT`
dissocie l'endpoint d'écriture (interne) de l'endpoint de lecture (public) exposé dans les URLs.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MembrePhotoStorage(S3Boto3Storage):
    bucket_name = settings.AWS_STORAGE_BUCKET_NAME
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"

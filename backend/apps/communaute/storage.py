"""
Storage MinIO dédié aux photos du fil d'actualité (FDD §3.2 Release Plan "Fil d'actualité —
Publications texte/photos") et, ajouté ensuite (Phase 4B), aux photos d'albums (Release Plan
§3.2 "Albums photos — upload collaboratif").

Contrairement aux photos produits (apps.boutique.storage.ProduitsStorage), qui vivent dans
un bucket dédié isolé ("produits"), le fil d'actualité ET les albums réutilisent le bucket
"défaut" (MINIO_BUCKET_DEFAULT="cid-media", voir settings/base.py) : il n'y a pas de raison
opérationnelle de provisionner un bucket MinIO supplémentaire pour ces photos, qui ont le
même profil de visibilité que les photos produits (montrées dans l'app à tout membre
authentifié — jamais de données sensibles).

Même piège que ProduitsStorage (voir sa docstring) : sans `custom_domain`, django-storages
construit l'URL de l'image à partir de `AWS_S3_ENDPOINT_URL` (settings.MINIO_ENDPOINT),
l'endpoint INTERNE utilisé par le backend pour parler à MinIO (ex. Railway
`<service>.railway.internal:9000`), jamais joignable depuis le navigateur d'un membre —
d'où l'icône d'image cassée. `MINIO_PUBLIC_ENDPOINT` (déjà configuré pour le bucket
produits) est réutilisé ici pour le même bucket "cid-media" : `custom_domain` dissocie
l'endpoint d'écriture (interne) de l'endpoint de lecture (public) exposé dans les URLs.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class PublicationsStorage(S3Boto3Storage):
    bucket_name = settings.AWS_STORAGE_BUCKET_NAME
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"


# Alias sémantique — même bucket/mêmes réglages que PublicationsStorage (voir docstring de
# tête), nommé différemment pour que `Photo.image.storage` se lise sans ambiguïté dans
# models.py plutôt que de réutiliser une classe au nom "Publications" pour un tout autre
# modèle (Photo, module Albums).
class AlbumsStorage(PublicationsStorage):
    pass

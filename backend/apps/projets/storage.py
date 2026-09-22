"""
Storage MinIO dédié aux photos du module Projets & Actions (demande utilisateur du
2026-09-22) — bucket isolé ("projets", voir settings.MINIO_BUCKET_PROJETS), même principe
que apps.boutique.storage.ProduitsStorage : ces photos (images de la kachel ET des rapports
d'avancement) sont montrées à tout membre authentifié dans l'app, jamais de données
sensibles — un bucket dédié plutôt que le bucket "défaut" (cid-media, réutilisé par
apps.communaute pour le fil/les albums) garde la rétention/l'administration de ce contenu
géré par les admins/responsables séparée du contenu généré par les membres.

Même piège que ProduitsStorage/PublicationsStorage (voir leurs docstrings) : sans
`custom_domain`, django-storages construit l'URL à partir de l'endpoint INTERNE MinIO
(settings.AWS_S3_ENDPOINT_URL), jamais joignable depuis le navigateur d'un membre —
`MINIO_PUBLIC_ENDPOINT` dissocie l'endpoint d'écriture (interne) de l'endpoint de lecture
(public) exposé dans les URLs.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class ProjetsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_PROJETS
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"

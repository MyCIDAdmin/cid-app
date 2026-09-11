"""
Storage MinIO dédié aux photos produits (FDD §3.4 "Photos MinIO").

Bucket isolé ("produits", voir settings.MINIO_BUCKET_PRODUITS) du bucket par défaut
("cid-media") et du bucket justificatifs (privé) — à la différence de
JustificatifsStorage (apps.adhesions.storage), les photos produits sont montrées dans
le catalogue public de l'application : `querystring_auth = False` désactive la
signature d'URL (sinon héritée de AWS_QUERYSTRING_AUTH=True, settings/base.py) pour
obtenir des URLs stables, sans expiration, adaptées à un `<img src=...>` mis en cache
côté frontend. Le bucket "produits" doit donc être configuré en lecture publique côté
MinIO (à la différence du bucket "justificatifs", qui doit rester privé).
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class ProduitsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_PRODUITS
    querystring_auth = False
    default_acl = None
    file_overwrite = False

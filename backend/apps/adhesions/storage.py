"""
Storage MinIO dédié aux justificatifs de rabais (AHM-20, FDD §9 / TDD §2 "Accès
justificatifs").

Bucket isolé ("justificatifs", voir MINIO_BUCKET_JUSTIFICATIFS) du bucket par
défaut ("cid-media") — accès restreint RH+/propriétaire (voir permissions.py),
jamais d'URL publique permanente : chaque lecture passe par une URL pré-signée
à durée de vie courte (15 min), obtenue via l'action `telecharger` du ViewSet
(voir views.py) plutôt qu'en exposant `fichier.url` brut dans les serializers.

django-storages génère déjà des URLs pré-signées pour tout S3Boto3Storage dès
lors que AWS_QUERYSTRING_AUTH=True (settings/base.py) — inutile d'appeler
manuellement le SDK MinIO comme l'exemple illustratif du TDD (`minio_client.
presigned_get_object(...)`) : `querystring_expire` ci-dessous obtient le même
résultat (TTL 900s) en restant dans le mécanisme déjà en place pour tous les
buckets de l'application.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class JustificatifsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_JUSTIFICATIFS
    querystring_expire = 900  # 15 minutes — FDD §9 "URL MinIO signée (TTL 15 min)"
    default_acl = None
    file_overwrite = False

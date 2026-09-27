"""
Storage MinIO dédié aux images du module Événements (demande utilisateur du 2026-09-27,
point 11.1 "Bild für Veranstaltungs-Kachel hochladen") — bucket isolé ("evenements", voir
settings.MINIO_BUCKET_EVENEMENTS), même principe que apps.projets.storage.ProjetsStorage /
apps.boutique.storage.ProduitsStorage : ces images de kachel sont montrées à tout visiteur
(y compris anonyme, voir Evenement.visible_public) dans l'app, jamais de données sensibles —
un bucket dédié garde la rétention/l'administration de ce contenu géré par les admins séparée
du contenu généré par les membres (cid-media, réutilisé par apps.communaute).

Même piège que ProduitsStorage/ProjetsStorage (voir leurs docstrings) : sans `custom_domain`,
django-storages construit l'URL à partir de l'endpoint INTERNE MinIO
(settings.AWS_S3_ENDPOINT_URL), jamais joignable depuis le navigateur d'un membre —
`MINIO_PUBLIC_ENDPOINT` dissocie l'endpoint d'écriture (interne) de l'endpoint de lecture
(public) exposé dans les URLs.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class EvenementsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_EVENEMENTS
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"

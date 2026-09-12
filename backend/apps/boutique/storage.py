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

Piège résolu ici (image qui ne s'affiche pas après upload, "icône image cassée" dans le
navigateur) : `AWS_S3_ENDPOINT_URL` (settings.MINIO_ENDPOINT) est l'endpoint INTERNE que
le backend utilise pour parler à MinIO — sur Railway par exemple
`<service>.railway.internal:9000`, qui n'est routable que depuis le réseau privé Railway
et jamais depuis le navigateur d'un membre. Sans configuration additionnelle,
django-storages construit `Produit.image.url` à partir de ce même endpoint interne : le
fichier existe bien sur MinIO, mais l'URL renvoyée à l'admin/au membre est tout
simplement inatteignable depuis l'extérieur. `custom_domain` (mécanisme standard
django-storages, cf. leur doc "Amazon S3 — custom domain") permet de dissocier les deux :
le backend continue à lire/écrire via l'endpoint interne, mais les URLs publiques
générées pointent vers `MINIO_PUBLIC_ENDPOINT` (un domaine/port réellement joignable par
un navigateur — domaine public Railway attaché au service MinIO, ou tout reverse-proxy/
CDN devant lui). Tant que `MINIO_PUBLIC_ENDPOINT` n'est pas renseigné, le comportement
précédent (potentiellement cassé en prod) est conservé pour ne rien changer en local où
l'endpoint est déjà accessible (voir docker-compose.yml, port 9000 publié).
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class ProduitsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_PRODUITS
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Instancié à l'import du modèle (Produit.image), donc évalué avec les settings
        # actifs au démarrage du process — suffisant en pratique, ces variables ne changent
        # jamais en cours d'exécution (définies par service/déploiement).
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"

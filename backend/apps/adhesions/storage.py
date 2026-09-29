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

Bug corrigé le 2026-09-16 (retour utilisateur : "voir le document" ouvre
`http://minio.railway.internal/...`, DNS_PROBE_FINISHED_NXDOMAIN dans le
navigateur) : `AWS_S3_ENDPOINT_URL` (settings.MINIO_ENDPOINT) est l'endpoint
INTERNE que le backend utilise pour parler à MinIO (Railway :
`<service>.railway.internal:9000`, jamais résolvable hors du réseau privé
Railway — voir docs/RAILWAY.md §7 et apps.boutique.storage.ProduitsStorage
pour le même piège sur le bucket produits). Sans correctif, l'URL pré-signée
renvoyée par `telecharger` pointe vers cet hôte interne.

Contrairement à ProduitsStorage/apps.communaute.storage.PublicationsStorage
(buckets publics, `querystring_auth = False`), on ne peut PAS se contenter de
poser `custom_domain = MINIO_PUBLIC_ENDPOINT` ici : `S3Storage.url()`
court-circuite alors totalement la signature de la requête dès que
`custom_domain` est renseigné (voir storages/backends/s3.py — le bloc
`if self.custom_domain` renvoie une URL SANS query-string de signature, sauf
CloudFront, absent ici) — cela casserait l'accès à ce bucket privé (403
MinIO) au lieu de le réparer.
`url()` est donc surchargée ci-dessous pour générer la signature avec un
second client boto3 pointé sur l'endpoint PUBLIC (MINIO_PUBLIC_ENDPOINT) —
mêmes identifiants/région/style d'adressage/version de signature que la
connexion interne (voir S3Storage.connection) — de sorte que l'URL renvoyée
au navigateur soit à la fois signée ET joignable. Tant que
MINIO_PUBLIC_ENDPOINT n'est pas défini (dev local, où l'endpoint interne est
déjà joignable — port 9000 publié par docker-compose), le comportement par
défaut de django-storages est conservé.
"""

from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage
from storages.utils import clean_name


class OffreIconeStorage(S3Boto3Storage):
    """Storage MinIO pour l'icône d'une offre d'adhésion (retour utilisateur du 2026-09-29,
    module "Verwaltung der Mitgliedschaftskampagnen" : "Icons für jede Angebotskachel
    hochladen") — bucket "défaut" (cid-media) et principe identiques à
    apps.membres.storage.MembrePhotoStorage/apps.communaute.storage.PublicationsStorage :
    icône montrée publiquement sur la carte de l'offre (mêmes lecteurs que le reste du
    catalogue de campagnes, CataloguePermission — lecture ouverte à tout le monde, y compris
    non authentifié), donc `custom_domain` + `querystring_auth = False` pour une URL publique
    stable, JAMAIS l'endpoint interne `minio.railway.internal` (voir le docstring de
    MembrePhotoStorage pour le détail du bug que ce motif évite)."""

    bucket_name = settings.AWS_STORAGE_BUCKET_NAME
    querystring_auth = False
    default_acl = None
    file_overwrite = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if settings.MINIO_PUBLIC_ENDPOINT:
            self.custom_domain = f"{settings.MINIO_PUBLIC_ENDPOINT}/{self.bucket_name}"
            self.url_protocol = "https:" if settings.MINIO_PUBLIC_USE_SSL else "http:"


class JustificatifsStorage(S3Boto3Storage):
    bucket_name = settings.MINIO_BUCKET_JUSTIFICATIFS
    querystring_expire = 900  # 15 minutes — FDD §9 "URL MinIO signée (TTL 15 min)"
    default_acl = None
    file_overwrite = False

    def url(self, name, parameters=None, expire=None, http_method=None):
        if not settings.MINIO_PUBLIC_ENDPOINT:
            return super().url(name, parameters=parameters, expire=expire, http_method=http_method)

        name = self._normalize_name(clean_name(name))
        params = parameters.copy() if parameters else {}
        if expire is None:
            expire = self.querystring_expire
        params["Bucket"] = self.bucket.name
        params["Key"] = name

        public_endpoint_url = (
            f"{'https' if settings.MINIO_PUBLIC_USE_SSL else 'http'}"
            f"://{settings.MINIO_PUBLIC_ENDPOINT}"
        )
        # Même session/identifiants/région/style d'adressage/version de signature que
        # self.connection (voir S3Storage.connection) — seul l'endpoint (et use_ssl
        # assorti) change, pour que la signature soit calculée contre l'hôte réellement
        # appelé par le navigateur plutôt que contre l'hôte interne.
        public_resource = self._create_session().resource(
            "s3",
            region_name=self.region_name,
            use_ssl=settings.MINIO_PUBLIC_USE_SSL,
            endpoint_url=public_endpoint_url,
            config=self.client_config,
            verify=self.verify,
        )
        return public_resource.meta.client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=expire, HttpMethod=http_method
        )

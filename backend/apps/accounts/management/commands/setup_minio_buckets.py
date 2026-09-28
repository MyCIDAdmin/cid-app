"""
Crée les buckets MinIO nécessaires et applique leur politique d'accès (lecture publique ou
privée) — idempotent, exécuté à chaque démarrage du backend (voir Dockerfile.prod et
docker-compose.yml) plutôt que d'être une étape manuelle via la console MinIO (:9001) ou
`mc mb`/`mc anonymous set download`, comme documenté jusqu'ici dans docs/RAILWAY.md §7 ("à
automatiser par un script d'init en Phase 1B" — jamais fait jusqu'à ce jour).

Absence de ce script = cause du bug remonté par l'utilisateur ("Selbe Problem beim Album wie
bei Projekten") : docs/RAILWAY.md ne décrivait la configuration en lecture publique que pour
le bucket "produits", jamais pour "cid-media" (bucket par défaut réutilisé par le fil
d'actualité ET les albums, voir apps.communaute.storage.PublicationsStorage/AlbumsStorage) ni
pour "projets" (apps.projets.storage.ProjetsStorage) — ces deux buckets restaient donc en
politique privée MinIO par défaut. Symptôme observé (F12 → Network) : 403 Forbidden sur les
`<img src=...>` pointant vers MinIO, et Opaque Response Blocking côté navigateur qui
intercepte l'erreur (MinIO répond en `application/xml`, pas `image/*`, sur un GET anonyme
refusé) — rien à voir avec des credentials/signatures manquants côté frontend : le fichier
existe bien, seule la politique du bucket bloque la lecture anonyme.

Même classe de bug pour "evenements" (retour utilisateur du 2026-09-27, point 11.2.1 :
"Bild konnte nicht hochgeladen werden. Hier wahrscheinlich Bucket Problem") — le bucket dédié
introduit par apps.evenements.storage.EvenementsStorage (2026-09-27, point 11.1) n'avait
jamais été ajouté à BUCKETS_PUBLICS ci-dessous. Contrairement au cas cid-media/projets
ci-dessus, MinIO ne crée jamais un bucket implicitement à l'écriture : le bucket "evenements"
n'existait donc pas du tout côté MinIO, et le PUT effectué par django-storages lors de
l'upload échouait directement avec `NoSuchBucket` (pas seulement l'affichage ensuite) — d'où
l'échec observé dès le téléversement, avant même la question d'une politique de lecture.

Chaque bucket "public" reçoit la même politique que `mc anonymous set download <alias>/<bucket>`
(lecture anonyme de tous les objets ; l'écriture reste réservée aux clés d'accès
MINIO_ACCESS_KEY/MINIO_SECRET_KEY, jamais exposée par cette politique). Chaque bucket "privé"
voit sa politique explicitement supprimée à chaque exécution, pour rester fermé même après une
réexécution suivant un changement de configuration côté MinIO.

Non bloquant par conception : une erreur sur un bucket (MinIO temporairement injoignable, clé
d'accès sans droit d'admin bucket) est journalisée mais n'interrompt ni les autres buckets ni
le démarrage du backend — seuls l'upload/l'affichage de fichiers en dépendent, pas le reste de
l'application.

Usage : python manage.py setup_minio_buckets
"""

import json

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand

# (nom du bucket, lecture publique ?) — cid-media/produits/projets/evenements sont montrés
# dans l'app à tout membre authentifié (evenements : même à un visiteur anonyme si
# Evenement.visible_public, voir apps.evenements.storage.EvenementsStorage), jamais de données
# sensibles (voir docstrings des Storage correspondants) ; justificatifs/exports restent privés
# (accès via URL pré-signée à durée limitée, voir apps.adhesions.storage.JustificatifsStorage /
# apps.stats).
BUCKETS_PUBLICS = [
    settings.AWS_STORAGE_BUCKET_NAME,  # cid-media — fil d'actualité + albums photos
    settings.MINIO_BUCKET_PRODUITS,
    settings.MINIO_BUCKET_PROJETS,
    settings.MINIO_BUCKET_EVENEMENTS,
]
BUCKETS_PRIVES = [
    settings.MINIO_BUCKET_JUSTIFICATIFS,
    settings.MINIO_BUCKET_EXPORTS,
]


def politique_lecture_publique(bucket_name: str) -> str:
    return json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{bucket_name}/*"],
                }
            ],
        }
    )


class Command(BaseCommand):
    help = "Crée les buckets MinIO manquants et (re)configure leur politique publique/privée."

    def handle(self, *args, **options):
        client = boto3.client(
            "s3",
            endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": settings.AWS_S3_ADDRESSING_STYLE},
            ),
        )

        for bucket_name in BUCKETS_PUBLICS:
            self._configurer(client, bucket_name, public=True)
        for bucket_name in BUCKETS_PRIVES:
            self._configurer(client, bucket_name, public=False)

    def _configurer(self, client, bucket_name, *, public):
        if not bucket_name:
            return
        try:
            self._creer_bucket_si_absent(client, bucket_name)
            if public:
                client.put_bucket_policy(
                    Bucket=bucket_name, Policy=politique_lecture_publique(bucket_name)
                )
            else:
                self._supprimer_politique_si_presente(client, bucket_name)
        except ClientError as err:
            # Voir docstring de tête : non bloquant, à vérifier manuellement si ça se répète.
            self.stderr.write(
                self.style.WARNING(f"  {bucket_name} : {err} — ignoré, à vérifier manuellement.")
            )
            return
        self.stdout.write(
            self.style.SUCCESS(f"  {bucket_name} : OK ({'public' if public else 'privé'})")
        )

    def _creer_bucket_si_absent(self, client, bucket_name):
        try:
            client.head_bucket(Bucket=bucket_name)
            return
        except ClientError as err:
            code = err.response.get("Error", {}).get("Code", "")
            if code not in ("404", "NoSuchBucket"):
                raise
        try:
            client.create_bucket(Bucket=bucket_name)
        except ClientError as err:
            code = err.response.get("Error", {}).get("Code", "")
            if code not in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                raise
            return
        self.stdout.write(f"  {bucket_name} : bucket créé.")

    def _supprimer_politique_si_presente(self, client, bucket_name):
        try:
            client.delete_bucket_policy(Bucket=bucket_name)
        except ClientError as err:
            code = err.response.get("Error", {}).get("Code", "")
            if code != "NoSuchBucketPolicy":
                raise

"""
Remplace le storage MinIO réel de Photo.image (et, depuis le 2026-09-20, Publication.image/
document) par un FileSystemStorage local pendant les tests de ce module — même raisonnement
que apps.adhesions.tests.conftest (_justificatifs_storage_local) : aucun MinIO n'est
disponible ni souhaitable en tests unitaires ; ce qui est testé ici est le comportement
applicatif (validation MIME/Pillow, permissions, IDOR), pas l'intégration S3Boto3Storage
elle-même (déjà couverte séparément par test_storage.py, sans écriture réelle de fichier).

Publication.image/document ont été ajoutés à cette fixture en même temps que
PublicationSerializer.validate_image/validate_document (retour utilisateur : image qui ne
s'affiche pas après publication) — jusque-là, AUCUN test ne créait de Publication avec un
fichier joint (voir test_api.py avant cette date), ce qui laissait ce chemin totalement non
couvert malgré le chemin Photo/Album équivalent déjà testé.

ConfigurationSitePublic.video_hero ajouté le 2026-09-27 (même raisonnement, voir
test_configuration_site.py) — sans ce patch, un test qui televerse réellement une vidéo tente
une écriture MinIO réelle (EndpointConnectionError, aucun MinIO en environnement de test).
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.communaute.models import ConfigurationSitePublic, Photo, Publication


@pytest.fixture(autouse=True)
def _photos_storage_local(tmp_path):
    champs = [
        Photo._meta.get_field("image"),
        Publication._meta.get_field("image"),
        Publication._meta.get_field("document"),
        ConfigurationSitePublic._meta.get_field("video_hero"),
    ]
    originaux = [champ.storage for champ in champs]
    for champ in champs:
        champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for champ, original in zip(champs, originaux):
        champ.storage = original

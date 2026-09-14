"""
Remplace le storage MinIO réel de Photo.image par un FileSystemStorage local pendant les
tests de ce module — même raisonnement que apps.adhesions.tests.conftest
(_justificatifs_storage_local) : aucun MinIO n'est disponible ni souhaitable en tests
unitaires ; ce qui est testé ici est le comportement applicatif (validation MIME/Pillow,
permissions, IDOR), pas l'intégration S3Boto3Storage elle-même (déjà couverte séparément
par test_storage.py, sans écriture réelle de fichier).
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.communaute.models import Photo


@pytest.fixture(autouse=True)
def _photos_storage_local(tmp_path):
    champ = Photo._meta.get_field("image")
    original = champ.storage
    champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    champ.storage = original

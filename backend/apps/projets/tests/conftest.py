"""
Remplace le storage MinIO réel de ProjetImage.image/ProjetMiseAJourImage.image par un
FileSystemStorage local pendant les tests de ce module — même raisonnement et même
convention que apps.communaute.tests.conftest._photos_storage_local (aucun MinIO
disponible ni souhaitable en tests unitaires ; ce qui est testé ici est le comportement
applicatif — validation MIME/Pillow, permissions, IDOR — pas l'intégration S3Boto3Storage
elle-même, déjà couverte séparément par apps.boutique.tests.test_storage sans écriture
réelle de fichier)."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.projets.models import ProjetImage, ProjetMiseAJourImage


@pytest.fixture(autouse=True)
def _projets_storage_local(tmp_path):
    champs = [
        ProjetImage._meta.get_field("image"),
        ProjetMiseAJourImage._meta.get_field("image"),
    ]
    originaux = [champ.storage for champ in champs]
    for champ in champs:
        champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for champ, original in zip(champs, originaux):
        champ.storage = original

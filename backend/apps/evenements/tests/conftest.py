"""
Remplace le storage MinIO réel de Evenement.image par un FileSystemStorage local pendant
les tests de ce module — même raisonnement et même convention que
apps.projets.tests.conftest._projets_storage_local / apps.communaute.tests.conftest
._photos_storage_local (aucun MinIO disponible ni souhaitable en tests unitaires ; ce qui
est testé ici est le comportement applicatif — validation MIME/Pillow, permissions — pas
l'intégration S3Boto3Storage elle-même, déjà couverte séparément par
apps.boutique.tests.test_storage sans écriture réelle de fichier)."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.evenements.models import Evenement


@pytest.fixture(autouse=True)
def _evenements_storage_local(tmp_path):
    champ = Evenement._meta.get_field("image")
    original = champ.storage
    champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    champ.storage = original

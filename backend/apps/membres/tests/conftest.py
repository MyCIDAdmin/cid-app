"""
Remplace le storage MinIO réel de Membre.photo par un FileSystemStorage local pendant les
tests de ce module — même raisonnement et même convention que
apps.communaute.tests.conftest._photos_storage_local / apps.projets.tests.conftest
._projets_storage_local (aucun MinIO disponible ni souhaitable en tests unitaires ; ce qui
est testé ici est le comportement applicatif — validation MIME/Pillow, permissions, IDOR —
pas l'intégration S3Boto3Storage elle-même, déjà couverte séparément par
apps.boutique.tests.test_storage sans écriture réelle de fichier).

Champ ajouté le 2026-09-28 (retour utilisateur, "zu dem Profile darf der User sein Bild
hochladen") — voir MembreSerializer.validate_photo et MembreViewSet.moi.
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.membres.models import Membre


@pytest.fixture(autouse=True)
def _membre_photo_storage_local(tmp_path):
    champ = Membre._meta.get_field("photo")
    original = champ.storage
    champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    champ.storage = original

"""
Remplace le storage MinIO réel de ProduitImage.image par un FileSystemStorage local pendant
les tests de ce module — même raisonnement et même convention que
apps.projets.tests.conftest._projets_storage_local / apps.evenements.tests.conftest
._evenements_storage_local (aucun MinIO disponible ni souhaitable en tests unitaires ; ce qui
est testé ici est le comportement applicatif — validation MIME/Pillow, permissions — pas
l'intégration S3Boto3Storage elle-même, déjà couverte séparément par
apps.boutique.tests.test_storage sans écriture réelle de fichier). Ne touche pas à
Produit.image (champ historique, pas de test d'upload réel existant pour lui)."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.boutique.models import ProduitImage


@pytest.fixture(autouse=True)
def _produit_images_storage_local(tmp_path):
    champ = ProduitImage._meta.get_field("image")
    original = champ.storage
    champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    champ.storage = original

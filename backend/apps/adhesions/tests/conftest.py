"""
Remplace le storage MinIO réel de JustificatifRabais.fichier par un FileSystemStorage
local pendant les tests de ce module (AHM-20) — aucun MinIO n'est disponible ni
souhaitable en tests unitaires ; ce qui est testé ici est le comportement applicatif
(validation, statuts, permissions, IDOR), pas l'intégration S3Boto3Storage elle-même.
`base_url` est fourni explicitement : MEDIA_URL n'est pas défini en settings (l'app
n'utilise jamais le storage local en dehors des tests), FileSystemStorage.url()
lèverait sinon une erreur sans lui.
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.adhesions.models import JustificatifRabais


@pytest.fixture(autouse=True)
def _justificatifs_storage_local(tmp_path):
    champ = JustificatifRabais._meta.get_field("fichier")
    original = champ.storage
    champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    champ.storage = original

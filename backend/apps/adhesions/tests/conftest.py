"""
Remplace le storage MinIO réel de JustificatifRabais.fichier (AHM-20) et, depuis le
2026-09-29, OffreAdhesion.icone ("Icons für jede Angebotskachel hochladen") par un
FileSystemStorage local pendant les tests de ce module — aucun MinIO n'est disponible ni
souhaitable en tests unitaires ; ce qui est testé ici est le comportement applicatif
(validation, statuts, permissions, IDOR), pas l'intégration S3Boto3Storage elle-même. Même
principe que apps.communaute.tests.conftest._photos_storage_local. `base_url` est fourni
explicitement : MEDIA_URL n'est pas défini en settings (l'app n'utilise jamais le storage
local en dehors des tests), FileSystemStorage.url() lèverait sinon une erreur sans lui.
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.adhesions.models import JustificatifRabais, OffreAdhesion


@pytest.fixture(autouse=True)
def _justificatifs_storage_local(tmp_path):
    champs = [
        JustificatifRabais._meta.get_field("fichier"),
        OffreAdhesion._meta.get_field("icone"),
    ]
    originaux = [champ.storage for champ in champs]
    for champ in champs:
        champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for champ, original in zip(champs, originaux):
        champ.storage = original

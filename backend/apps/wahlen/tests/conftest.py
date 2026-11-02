"""Ersetzt den privaten Datei-Speicher (MinIO) während der Tests durch ein lokales Verzeichnis –
getestet wird das Verhalten der App, nicht die S3-Anbindung (gleiches Prinzip wie adhesions)."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.wahlen.models import KandidatPerson, Nachweis


@pytest.fixture(autouse=True)
def _speicher_lokal(tmp_path):
    felder = [KandidatPerson._meta.get_field("foto"), Nachweis._meta.get_field("datei")]
    originale = [f.storage for f in felder]
    for feld in felder:
        feld.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for feld, original in zip(felder, originale):
        feld.storage = original

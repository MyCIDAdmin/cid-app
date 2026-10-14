"""Ersetzt den MinIO-Speicher der Regionsbilder in den Tests durch ein lokales Dateisystem."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.regionen.models import Beitrag, Region, Veranstaltung, Verantwortlicher


@pytest.fixture(autouse=True)
def _regionen_storage_lokal(tmp_path):
    felder = [
        Region._meta.get_field("banner"),
        Verantwortlicher._meta.get_field("foto"),
        Beitrag._meta.get_field("bild"),
        Veranstaltung._meta.get_field("bild"),
    ]
    originale = [feld.storage for feld in felder]
    for feld in felder:
        feld.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for feld, original in zip(felder, originale):
        feld.storage = original

"""Ersetzt den MinIO-Speicher von Partner.logo/PartnerDokument.datei in den Tests durch ein
lokales Dateisystem (kein MinIO in Unit-Tests ; geprüft wird die Anwendungslogik)."""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.partenaires.models import Partner, PartnerDokument


@pytest.fixture(autouse=True)
def _partner_storage_lokal(tmp_path):
    felder = [Partner._meta.get_field("logo"), PartnerDokument._meta.get_field("datei")]
    originale = [feld.storage for feld in felder]
    for feld in felder:
        feld.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for feld, original in zip(felder, originale):
        feld.storage = original

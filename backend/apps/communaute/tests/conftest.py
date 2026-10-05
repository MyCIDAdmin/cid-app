"""
Remplace le storage MinIO réel de Photo.image (et, depuis le 2026-09-20, Publication.image/
document) par un FileSystemStorage local pendant les tests de ce module — même raisonnement
que apps.adhesions.tests.conftest (_justificatifs_storage_local) : aucun MinIO n'est
disponible ni souhaitable en tests unitaires ; ce qui est testé ici est le comportement
applicatif (validation MIME/Pillow, permissions, IDOR), pas l'intégration S3Boto3Storage
elle-même (déjà couverte séparément par test_storage.py, sans écriture réelle de fichier).

Publication.image/document ont été ajoutés à cette fixture en même temps que
PublicationSerializer.validate_image/validate_document (retour utilisateur : image qui ne
s'affiche pas après publication) — jusque-là, AUCUN test ne créait de Publication avec un
fichier joint (voir test_api.py avant cette date), ce qui laissait ce chemin totalement non
couvert malgré le chemin Photo/Album équivalent déjà testé.

ConfigurationSitePublic.video_hero ajouté le 2026-09-27 (même raisonnement, voir
test_configuration_site.py) — sans ce patch, un test qui televerse réellement une vidéo tente
une écriture MinIO réelle (EndpointConnectionError, aucun MinIO en environnement de test).

EquipeLogo.logo ajouté le 2026-09-28 (même raisonnement — Fan-Club, upload de logos
d'équipes, voir test_api.py::test_equipe_logos_*).

ArrierePlanModule.image ajouté le 2026-09-29 (même raisonnement — images de fond par
module, voir test_api.py::test_arriere_plans_modules_*).
"""

import pytest
from django.core.files.storage import FileSystemStorage

from apps.communaute.models import (
    ArrierePlanModule,
    ConfigurationSitePublic,
    EquipeLogo,
    Photo,
    Publication,
)


@pytest.fixture(autouse=True)
def _photos_storage_local(tmp_path):
    champs = [
        Photo._meta.get_field("image"),
        Publication._meta.get_field("image"),
        Publication._meta.get_field("document"),
        ConfigurationSitePublic._meta.get_field("video_hero"),
        ConfigurationSitePublic._meta.get_field("kachel1_media"),
        ConfigurationSitePublic._meta.get_field("kachel2_media"),
        EquipeLogo._meta.get_field("logo"),
        ArrierePlanModule._meta.get_field("image"),
    ]
    originaux = [champ.storage for champ in champs]
    for champ in champs:
        champ.storage = FileSystemStorage(location=str(tmp_path), base_url="/media-test/")
    yield
    for champ, original in zip(champs, originaux):
        champ.storage = original

"""
Tests — apps.boutique.emails.logo_email_url (ajouté le 2026-09-23, voir docstring du module
pour l'historique complet des deux bugs réels précédents en production : `data:` URI inline
tronquant l'email côté Gmail, puis pièce jointe inline rejetée par le backend Anymail/Brevo
utilisé en prod). Vérifie ici uniquement le mécanisme d'auto-provisionnement MinIO — les tests
d'intégration bout-en-bout (contenu de l'email envoyé) vivent dans test_tasks.py.

Aucun de ces tests ne touche un vrai MinIO : `ProduitsStorage.exists`/`.save` sont mockés — seule
`.url()` s'exécute réellement, un pur assemblage de chaîne sans appel réseau (voir
test_storage.py pour la même hypothèse déjà vérifiée ailleurs dans le projet).
"""

from unittest.mock import MagicMock, patch

import pytest

from apps.boutique.emails import logo_email_url


@pytest.fixture(autouse=True)
def _vide_le_cache_avant_et_apres():
    # logo_email_url est `lru_cache(maxsize=1)` — sans ce nettoyage, le premier test à l'appeler
    # figerait sa valeur (et ses mocks) pour tous les tests suivants du même process pytest.
    logo_email_url.cache_clear()
    yield
    logo_email_url.cache_clear()


def test_logo_email_url_upload_le_logo_si_absent_du_bucket():
    with patch("apps.boutique.emails.ProduitsStorage") as StorageMock:
        storage = StorageMock.return_value
        storage.exists.return_value = False
        storage.url.return_value = "https://cid-media.example/produits/_emails/logo_cid_email.jpg"

        url = logo_email_url()

        storage.exists.assert_called_once_with("_emails/logo_cid_email.jpg")
        storage.save.assert_called_once()
        nom_sauvegarde = storage.save.call_args[0][0]
        assert nom_sauvegarde == "_emails/logo_cid_email.jpg"
        assert url == "https://cid-media.example/produits/_emails/logo_cid_email.jpg"


def test_logo_email_url_ne_reupload_jamais_si_deja_present():
    with patch("apps.boutique.emails.ProduitsStorage") as StorageMock:
        storage = StorageMock.return_value
        storage.exists.return_value = True
        storage.url.return_value = "https://cid-media.example/produits/_emails/logo_cid_email.jpg"

        logo_email_url()

        storage.save.assert_not_called()


def test_logo_email_url_est_mise_en_cache_par_process():
    # Deuxième appel : ne doit plus jamais retoucher le storage, même un objet déjà présent
    # (voir _logo_email_url_sans_reseau dans test_tasks.py, qui s'appuie sur cette même
    # propriété pour éviter tout appel réseau répété pendant les tests).
    with patch("apps.boutique.emails.ProduitsStorage") as StorageMock:
        storage = StorageMock.return_value
        storage.exists.return_value = True
        storage.url.return_value = "https://cid-media.example/produits/_emails/logo_cid_email.jpg"

        premier = logo_email_url()
        deuxieme = logo_email_url()

        assert premier == deuxieme
        assert StorageMock.call_count == 1

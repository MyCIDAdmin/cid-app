"""
Tests unitaires — génération du reçu PDF (AHM-17, RICEFW R-010).

Le PDF binaire lui-même n'est pas parsé (WeasyPrint compresse les flux de texte) : on vérifie
la signature %PDF- et, séparément, la résolution de la langue (_resoudre_langue) qui pilote le
gabarit — plus robuste qu'une recherche de sous-chaîne dans les octets du PDF.
"""

import pytest

from apps.accounts.models import Role, User
from apps.cotisations.pdf import TRADUCTIONS, _resoudre_langue, generate_receipt_pdf
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _user(langue_preferee):
    return User.objects.create_user(
        email=f"{langue_preferee}@example.de",
        password="Password123!",
        role=Role.MEMBRE,
        is_active=True,
        langue_preferee=langue_preferee,
    )


def test_generate_receipt_pdf_retourne_un_pdf_valide():
    cotisation = CotisationFactory()

    pdf_bytes = generate_receipt_pdf(cotisation)

    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000  # un PDF WeasyPrint valide n'est jamais quasi-vide


def test_resoudre_langue_fr_par_defaut_sans_compte_lie():
    membre = MembreFactory(user=None)  # fiche importée, pas de compte de connexion
    cotisation = CotisationFactory(membre=membre)

    assert _resoudre_langue(cotisation.membre.user) == "fr"


def test_resoudre_langue_suit_la_preference_du_membre():
    user_de = _user("de")
    membre = MembreFactory(user=user_de)
    cotisation = CotisationFactory(membre=membre)

    assert _resoudre_langue(cotisation.membre.user) == "de"


def test_resoudre_langue_repli_fr_pour_arabe():
    # AR explicitement hors périmètre de cette itération (voir docstring pdf.py) — un membre
    # préférant l'arabe reçoit un reçu en français plutôt qu'un gabarit RTL non abouti.
    user_ar = _user("ar")
    membre = MembreFactory(user=user_ar)
    cotisation = CotisationFactory(membre=membre)

    assert _resoudre_langue(cotisation.membre.user) == "fr"


def test_toutes_les_traductions_ont_les_memes_cles():
    cles_fr = set(TRADUCTIONS["fr"].keys())
    cles_de = set(TRADUCTIONS["de"].keys())
    assert cles_fr == cles_de


def test_pdf_genere_en_allemand_pour_un_membre_de():
    user_de = _user("de")
    membre = MembreFactory(user=user_de)
    cotisation = CotisationFactory(membre=membre)

    pdf_bytes = generate_receipt_pdf(cotisation)

    assert pdf_bytes.startswith(b"%PDF-")

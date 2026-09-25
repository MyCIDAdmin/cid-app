"""
Tests unitaires — génération des documents PDF de commande (demande utilisateur du 2026-09-25,
module "Shop-Verwaltung"). Même principe que apps.cotisations.tests.test_pdf : le PDF binaire
n'est pas parsé (WeasyPrint compresse les flux de texte), on vérifie la signature %PDF- et la
résolution de la langue.
"""

from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import Role, User
from apps.boutique.pdf import (
    TRADUCTIONS,
    _resoudre_langue,
    generate_confirmation_pdf,
    generate_facture_pdf,
)
from apps.boutique.tests.factories import CommandeFactory, LigneCommandeFactory
from apps.membres.tests.factories import MembreFactory

pytestmark = pytest.mark.django_db


def _user(langue_preferee):
    return User.objects.create_user(
        email=f"pdf-boutique-{langue_preferee}@example.de",
        password="Password123!",
        role=Role.MEMBRE,
        is_active=True,
        langue_preferee=langue_preferee,
    )


def test_generate_confirmation_pdf_retourne_un_pdf_valide():
    commande = CommandeFactory()
    LigneCommandeFactory(commande=commande, prix_unitaire=Decimal("15.00"), quantite=2)

    pdf_bytes = generate_confirmation_pdf(commande)

    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000


def test_generate_confirmation_pdf_fonctionne_sans_paiement_confirme():
    # La confirmation de commande est disponible dès la création, avant tout paiement — voir
    # docstring de module de apps.boutique.pdf.
    commande = CommandeFactory(date_paiement_confirme=None, mode_paiement="")

    pdf_bytes = generate_confirmation_pdf(commande)

    assert pdf_bytes.startswith(b"%PDF-")


def test_generate_facture_pdf_retourne_un_pdf_valide():
    commande = CommandeFactory(
        statut="confirmee",
        mode_paiement="virement",
        date_paiement_confirme=timezone.now(),
    )
    LigneCommandeFactory(commande=commande)

    pdf_bytes = generate_facture_pdf(commande)

    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")


def test_resoudre_langue_fr_par_defaut_sans_compte_lie():
    membre = MembreFactory(user=None)

    assert _resoudre_langue(membre.user) == "fr"


def test_resoudre_langue_suit_la_preference_du_membre():
    user_de = _user("de")
    membre = MembreFactory(user=user_de)
    commande = CommandeFactory(membre=membre)

    assert _resoudre_langue(commande.membre.user) == "de"


def test_resoudre_langue_repli_fr_pour_arabe():
    # Même raisonnement que apps.cotisations.pdf (portée FR/DE, l'arabe reste Phase 5).
    user_ar = _user("ar")
    membre = MembreFactory(user=user_ar)
    commande = CommandeFactory(membre=membre)

    assert _resoudre_langue(commande.membre.user) == "fr"


def test_traductions_couvrent_fr_et_de():
    assert set(TRADUCTIONS.keys()) == {"fr", "de"}
    for langue, t in TRADUCTIONS.items():
        assert set(t["titles"].keys()) == {"confirmation", "facture"}

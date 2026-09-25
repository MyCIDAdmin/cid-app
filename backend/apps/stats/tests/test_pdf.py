"""
Tests unitaires — génération du PDF "Dashboard" (demande utilisateur du 2026-09-25, module
"Statistiken & KPIs" : "Export als PDF/Excel-Dashboard"). Même principe que
apps.boutique.tests.test_pdf/apps.cotisations.tests.test_pdf : le PDF binaire n'est pas parsé, on
vérifie la signature %PDF- et la résolution de la langue.
"""

import pytest

from apps.accounts.models import Role, User
from apps.stats.pdf import TRADUCTIONS, _resoudre_langue, generate_dashboard_pdf
from apps.stats.services import kpis_evenements, kpis_financier, kpis_membres

pytestmark = pytest.mark.django_db


def _user(langue_preferee):
    return User.objects.create_user(
        email=f"pdf-stats-{langue_preferee}@example.de",
        password="Password123!",
        role=Role.BUREAU_ADMIN,
        is_active=True,
        langue_preferee=langue_preferee,
    )


def test_generate_dashboard_pdf_retourne_un_pdf_valide():
    user = _user("fr")
    pdf_bytes = generate_dashboard_pdf(
        kpis_financier=kpis_financier(),
        kpis_membres=kpis_membres(),
        kpis_evenements=kpis_evenements(),
        user=user,
        filtres_affiches="Année 2026",
    )

    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000


def test_generate_dashboard_pdf_fonctionne_en_allemand():
    user = _user("de")
    pdf_bytes = generate_dashboard_pdf(
        kpis_financier=kpis_financier(),
        kpis_membres=kpis_membres(),
        kpis_evenements=kpis_evenements(),
        user=user,
        filtres_affiches="—",
    )

    assert pdf_bytes.startswith(b"%PDF-")


def test_resoudre_langue_repli_fr_pour_arabe():
    user_ar = _user("ar")
    assert _resoudre_langue(user_ar) == "fr"


def test_resoudre_langue_fr_sans_utilisateur():
    assert _resoudre_langue(None) == "fr"


def test_traductions_couvrent_fr_et_de():
    assert set(TRADUCTIONS.keys()) == {"fr", "de"}
    for t in TRADUCTIONS.values():
        assert set(t["libelles_financier"].keys()) == {
            "solde",
            "recettes",
            "depenses",
            "taux_collecte",
            "cotisations_en_attente",
            "revenus_boutique",
            "revenus_adhesions",
            "revenus_evenements",
        }

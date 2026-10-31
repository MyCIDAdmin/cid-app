"""Tests für den Demo-Daten-Befehl (nur DEV)."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import Role, User
from apps.cotisations.models import Cotisation
from apps.finances.models import Depense, StatutDepense
from apps.membres.models import Membre

pytestmark = pytest.mark.django_db


def test_ohne_freigabe_verweigert(settings):
    settings.DEMO_DATEN_ERLAUBT = False
    with pytest.raises(CommandError):
        call_command("demo_daten")
    assert not User.objects.filter(email__endswith="@cid-demo.test").exists()


def test_legt_konten_je_rolle_und_daten_an(settings):
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = "Test-Passwort-123"
    call_command("demo_daten")
    rollen = set(
        User.objects.filter(email__endswith="@cid-demo.test").values_list("role", flat=True)
    )
    assert rollen == {r.value for r in Role}
    user = User.objects.get(email="demo-finanz@cid-demo.test")
    assert user.check_password("Test-Passwort-123") and user.is_active
    assert Membre.objects.filter(user=user).exists()
    offen = Depense.objects.filter(
        fournisseur__startswith="[DEMO]", statut=StatutDepense.EN_ATTENTE
    )
    assert offen.count() == 1
    assert Cotisation.objects.filter(membre__email__endswith="@cid-demo.test").count() == 3


def test_reset_ist_idempotent(settings):
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = "x" * 12
    call_command("demo_daten")
    call_command("demo_daten")
    assert Depense.objects.filter(fournisseur__startswith="[DEMO]").count() == 3
    offen = Depense.objects.get(fournisseur="[DEMO] Flyer-Druck")
    offen.delete()
    call_command("demo_daten", "--reset")
    assert Depense.objects.filter(fournisseur__startswith="[DEMO]").count() == 3
    assert User.objects.filter(email__endswith="@cid-demo.test").count() == 5


def test_passwort_setzen_aendert_nur_das_passwort(settings):
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = "Altes-Passwort-1"
    call_command("demo_daten")
    fremd = User.objects.create_user(email="echt@example.org", password="Fremd-Passwort-1")
    anzahl_ausgaben = Depense.objects.filter(fournisseur__startswith="[DEMO]").count()
    anzahl_membres = Membre.objects.count()

    settings.DEMO_PASSWORT = "Neues-Passwort-2"
    call_command("demo_daten", "--passwort-setzen")

    for user in User.objects.filter(email__endswith="@cid-demo.test"):
        assert user.check_password("Neues-Passwort-2")
        assert not user.check_password("Altes-Passwort-1")
    fremd.refresh_from_db()
    assert fremd.check_password("Fremd-Passwort-1")
    assert Depense.objects.filter(fournisseur__startswith="[DEMO]").count() == anzahl_ausgaben
    assert Membre.objects.count() == anzahl_membres
    assert User.objects.filter(email__endswith="@cid-demo.test").count() == 5


def test_passwort_setzen_braucht_freigabe_und_passwort(settings):
    settings.DEMO_DATEN_ERLAUBT = False
    settings.DEMO_PASSWORT = "Neues-Passwort-2"
    with pytest.raises(CommandError):
        call_command("demo_daten", "--passwort-setzen")
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = ""
    with pytest.raises(CommandError):
        call_command("demo_daten", "--passwort-setzen")
    settings.DEMO_PASSWORT = "kurz"
    with pytest.raises(CommandError):
        call_command("demo_daten", "--passwort-setzen")


def test_passwort_setzen_legt_keine_konten_an(settings):
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = "Neues-Passwort-2"
    call_command("demo_daten", "--passwort-setzen")
    assert not User.objects.filter(email__endswith="@cid-demo.test").exists()


def test_passwort_setzen_nicht_mit_reset(settings):
    settings.DEMO_DATEN_ERLAUBT = True
    settings.DEMO_PASSWORT = "Neues-Passwort-2"
    with pytest.raises(CommandError):
        call_command("demo_daten", "--passwort-setzen", "--reset")

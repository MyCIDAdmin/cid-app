import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import AuditLogEntry, Role, User
from apps.zentral.models import ZentraleEinstellungen

pytestmark = pytest.mark.django_db

URL = "zentral:einstellungen"


def _client(role):
    user = User.objects.create_user(
        email=f"{role}@example.de", password="Password123!", role=role, is_active=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


def test_standardwert_20_minuten():
    assert ZentraleEinstellungen.get_solo().warenkorb_reservierung_minuten == 20


def test_lesen_fuer_angemeldete_schreiben_nur_app_admin():
    assert APIClient().get(reverse(URL)).status_code == 401
    client, _ = _client(Role.MEMBRE)
    assert client.get(reverse(URL)).data["warenkorb_reservierung_minuten"] == 20
    assert client.patch(reverse(URL), {"warenkorb_reservierung_minuten": 5}).status_code == 403
    vorstand, _ = _client(Role.BUREAU_ADMIN)
    assert vorstand.patch(reverse(URL), {"warenkorb_reservierung_minuten": 5}).status_code == 403


def test_app_admin_aendert_dauer_mit_audit():
    client, user = _client(Role.SUPER_ADMIN)
    resp = client.patch(reverse(URL), {"warenkorb_reservierung_minuten": 30}, format="json")
    assert resp.status_code == 200
    assert ZentraleEinstellungen.get_solo().warenkorb_reservierung_minuten == 30
    assert ZentraleEinstellungen.get_solo().modifie_par == user
    assert AuditLogEntry.objects.filter(action="zentrale_einstellungen_geaendert").exists()


@pytest.mark.parametrize("wert", [0, -1, 1441])
def test_ungueltige_dauer_wird_abgelehnt(wert):
    client, _ = _client(Role.SUPER_ADMIN)
    resp = client.patch(reverse(URL), {"warenkorb_reservierung_minuten": wert}, format="json")
    assert resp.status_code == 400


def test_zahlungsfrist_standard_zwei_tage_und_grenzen():
    assert ZentraleEinstellungen.get_solo().event_zahlungsfrist_tage == 2
    client, _ = _client(Role.SUPER_ADMIN)
    assert (
        client.patch(reverse(URL), {"event_zahlungsfrist_tage": 7}, format="json").status_code
        == 200
    )
    assert ZentraleEinstellungen.get_solo().event_zahlungsfrist_tage == 7
    for wert in (0, 31):
        resp = client.patch(reverse(URL), {"event_zahlungsfrist_tage": wert}, format="json")
        assert resp.status_code == 400


def test_max_erneuerungen_standard_zwei_und_grenzen():
    assert ZentraleEinstellungen.get_solo().warenkorb_max_erneuerungen == 2
    client, _ = _client(Role.SUPER_ADMIN)
    for wert in (0, 5, 10):
        resp = client.patch(reverse(URL), {"warenkorb_max_erneuerungen": wert}, format="json")
        assert resp.status_code == 200
        assert ZentraleEinstellungen.get_solo().warenkorb_max_erneuerungen == wert
    for wert in (-1, 11):
        resp = client.patch(reverse(URL), {"warenkorb_max_erneuerungen": wert}, format="json")
        assert resp.status_code == 400

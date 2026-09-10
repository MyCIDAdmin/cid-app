import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def membre_actif():
    return User.objects.create_user(
        email="membre@example.com", password="Password123!", is_active=True
    )


def test_login_success_no_2fa(api_client, membre_actif):
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "membre@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


def test_login_wrong_password(api_client, membre_actif):
    url = reverse("accounts:login")
    resp = api_client.post(url, {"email": "membre@example.com", "password": "wrong"}, format="json")
    assert resp.status_code == 401


def test_login_inactive_account(api_client):
    User.objects.create_user(email="inactif@example.com", password="Password123!")
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "inactif@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "account_inactive"


def test_login_bureau_admin_requires_2fa(api_client):
    User.objects.create_user(
        email="bureau@example.com",
        password="Password123!",
        role=Role.BUREAU_ADMIN,
        is_active=True,
    )
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "bureau@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["requires_2fa"] is True
    assert "login_ticket" in resp.data


def test_me_requires_authentication(api_client):
    url = reverse("accounts:me")
    resp = api_client.get(url)
    assert resp.status_code == 401


def test_register_creates_inactive_member(api_client):
    url = reverse("accounts:register")
    resp = api_client.post(
        url,
        {
            "email": "nouveau@example.com",
            "password": "Password123!",
            "langue_preferee": "fr",
            "consentement_rgpd": True,
        },
        format="json",
    )
    assert resp.status_code == 201
    user = User.objects.get(email="nouveau@example.com")
    assert user.is_active is False


def test_register_without_rgpd_consent_fails(api_client):
    url = reverse("accounts:register")
    resp = api_client.post(
        url,
        {
            "email": "nouveau2@example.com",
            "password": "Password123!",
            "consentement_rgpd": False,
        },
        format="json",
    )
    assert resp.status_code == 400

"""Passkeys (WebAuthn) : Einrichten, Anmelden, Entfernen — mit einem simulierten Authenticator."""

import hashlib
import json
import os
import struct

import cbor2
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient
from webauthn.helpers import bytes_to_base64url

from apps.accounts import passkeys
from apps.accounts.models import AuditLogEntry, Passkey, Role, User

pytestmark = pytest.mark.django_db


class FakeAuthenticator:
    """Minimaler Software-Authenticator (ES256, Format "none", UV-Flag gesetzt)."""

    def __init__(self, *, user_verified=True):
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.credential_id = os.urandom(32)
        self.counter = 0
        self.flags_uv = 0x04 if user_verified else 0

    def _client_data(self, typ, challenge_b64):
        return json.dumps(
            {
                "type": typ,
                "challenge": challenge_b64,
                "origin": settings.FRONTEND_URL.rstrip("/"),
                "crossOrigin": False,
            }
        ).encode()

    def _rp_hash(self):
        return hashlib.sha256(passkeys.rp_id().encode()).digest()

    def register(self, options):
        numbers = self.key.public_key().public_numbers()
        cose = cbor2.dumps(
            {
                1: 2,
                3: -7,
                -1: 1,
                -2: numbers.x.to_bytes(32, "big"),
                -3: numbers.y.to_bytes(32, "big"),
            }
        )
        auth_data = (
            self._rp_hash()
            + bytes([0x01 | self.flags_uv | 0x40])
            + struct.pack(">I", self.counter)
            + bytes(16)
            + struct.pack(">H", len(self.credential_id))
            + self.credential_id
            + cose
        )
        attestation = cbor2.dumps({"fmt": "none", "attStmt": {}, "authData": auth_data})
        client = self._client_data("webauthn.create", options["challenge"])
        cid = bytes_to_base64url(self.credential_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client),
                "attestationObject": bytes_to_base64url(attestation),
                "transports": ["internal"],
            },
        }

    def login(self, options, user_handle=None):
        self.counter += 1
        auth_data = (
            self._rp_hash() + bytes([0x01 | self.flags_uv]) + struct.pack(">I", self.counter)
        )
        client = self._client_data("webauthn.get", options["challenge"])
        signature = self.key.sign(
            auth_data + hashlib.sha256(client).digest(), ec.ECDSA(hashes.SHA256())
        )
        cid = bytes_to_base64url(self.credential_id)
        return {
            "id": cid,
            "rawId": cid,
            "type": "public-key",
            "response": {
                "clientDataJSON": bytes_to_base64url(client),
                "authenticatorData": bytes_to_base64url(auth_data),
                "signature": bytes_to_base64url(signature),
                "userHandle": user_handle,
            },
        }


@pytest.fixture
def user():
    return User.objects.create_user(
        email="passkey@example.com", password="Password123!", is_active=True
    )


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def _einrichten(client, authenticator, name="Mein Handy"):
    options = client.post(reverse("accounts:passkey-register-options")).data
    resp = client.post(
        reverse("accounts:passkey-register-verify"),
        {"credential": authenticator.register(options), "name": name},
        format="json",
    )
    return options, resp


def _anmelden(authenticator, **extra):
    anon = APIClient()
    data = anon.post(reverse("accounts:passkey-login-options")).data
    credential = authenticator.login(data["options"])
    return anon.post(
        reverse("accounts:passkey-login-verify"),
        {"challenge_id": data["challenge_id"], "credential": credential, **extra},
        format="json",
    )


def test_optionen_verlangen_biometrie_und_auffindbaren_schluessel(auth_client):
    resp = auth_client.post(reverse("accounts:passkey-register-options"))
    assert resp.status_code == 200
    sel = resp.data["authenticatorSelection"]
    assert sel["userVerification"] == "required"
    assert sel["residentKey"] == "required"
    assert resp.data["rp"]["id"] == passkeys.rp_id()


def test_einrichten_speichert_passkey(auth_client, user):
    _, resp = _einrichten(auth_client, FakeAuthenticator())
    assert resp.status_code == 201
    assert user.passkeys.get().name == "Mein Handy"
    assert AuditLogEntry.objects.filter(user=user, action="passkey_added").exists()
    liste = auth_client.get(reverse("accounts:passkeys"))
    assert [p["name"] for p in liste.data] == ["Mein Handy"]


def test_einrichten_ohne_biometrie_wird_abgelehnt(auth_client, user):
    _, resp = _einrichten(auth_client, FakeAuthenticator(user_verified=False))
    assert resp.status_code == 400
    assert user.passkeys.count() == 0


def test_einrichten_braucht_anmeldung():
    resp = APIClient().post(reverse("accounts:passkey-register-options"))
    assert resp.status_code in (401, 403)


def test_einrichten_ohne_vorherige_optionen_scheitert(auth_client):
    resp = auth_client.post(
        reverse("accounts:passkey-register-verify"),
        {"credential": FakeAuthenticator().register({"challenge": "AAAA"})},
        format="json",
    )
    assert resp.status_code == 400


def test_anmeldung_mit_passkey_ohne_passwort_und_code(auth_client, user):
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    resp = _anmelden(authenticator, device_id="geraet-1")
    assert resp.status_code == 200
    assert resp.data["access"] and resp.data["refresh"]
    assert resp.data["user"]["email"] == "passkey@example.com"
    passkey = user.passkeys.get()
    assert passkey.last_used_at is not None
    assert passkey.sign_count == 1
    assert AuditLogEntry.objects.filter(user=user, action="login_passkey_success").exists()


def test_anmeldung_ersetzt_2fa_auch_fuer_administratoren(auth_client, user):
    user.role = Role.SUPER_ADMIN
    user.save()
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    resp = _anmelden(authenticator)
    assert resp.status_code == 200
    assert "access" in resp.data


def test_challenge_ist_nur_einmal_gueltig(auth_client):
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    anon = APIClient()
    data = anon.post(reverse("accounts:passkey-login-options")).data
    body = {
        "challenge_id": data["challenge_id"],
        "credential": authenticator.login(data["options"]),
    }
    assert (
        anon.post(reverse("accounts:passkey-login-verify"), body, format="json").status_code == 200
    )
    assert (
        anon.post(reverse("accounts:passkey-login-verify"), body, format="json").status_code == 401
    )


def test_unbekannter_passkey_wird_abgelehnt(user):
    resp = _anmelden(FakeAuthenticator())
    assert resp.status_code == 401
    assert AuditLogEntry.objects.filter(action="login_passkey_failed").exists()


def test_falsche_signatur_wird_abgelehnt(auth_client, user):
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    anon = APIClient()
    data = anon.post(reverse("accounts:passkey-login-options")).data
    credential = authenticator.login(data["options"])
    fremd = FakeAuthenticator()
    fremd.credential_id = authenticator.credential_id
    fremd.counter = 1
    credential = fremd.login(data["options"])  # mit anderem Schlüssel signiert
    resp = anon.post(
        reverse("accounts:passkey-login-verify"),
        {"challenge_id": data["challenge_id"], "credential": credential},
        format="json",
    )
    assert resp.status_code == 401


def test_inaktives_konto_kann_sich_nicht_anmelden(auth_client, user):
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    user.is_active = False
    user.save()
    resp = _anmelden(authenticator)
    assert resp.status_code == 403


def test_passkey_entfernen_nur_eigene(auth_client, user):
    _einrichten(auth_client, FakeAuthenticator())
    passkey = user.passkeys.get()
    fremd = APIClient()
    fremd.force_authenticate(
        User.objects.create_user(email="x@example.com", password="Password123!", is_active=True)
    )
    assert fremd.delete(reverse("accounts:passkey-detail", args=[passkey.id])).status_code == 404
    assert (
        auth_client.delete(reverse("accounts:passkey-detail", args=[passkey.id])).status_code == 204
    )
    assert Passkey.objects.count() == 0
    assert AuditLogEntry.objects.filter(user=user, action="passkey_removed").exists()


def test_doppelter_passkey_wird_abgelehnt(auth_client):
    authenticator = FakeAuthenticator()
    _einrichten(auth_client, authenticator)
    _, resp = _einrichten(auth_client, authenticator, name="nochmal")
    assert resp.status_code == 400

"""
Passkeys (WebAuthn) — Anmeldung per Fingerabdruck, Gesicht oder Geräte-PIN.

  GET    /auth/passkeys/                    — eigene Passkeys (angemeldet)
  POST   /auth/passkeys/register/options/   — Optionen zum Einrichten (angemeldet)
  POST   /auth/passkeys/register/verify/    — Passkey speichern (angemeldet)
  DELETE /auth/passkeys/<id>/               — Passkey entfernen (angemeldet, nur eigene)
  POST   /auth/passkeys/login/options/      — Optionen zum Anmelden (öffentlich)
  POST   /auth/passkeys/login/verify/       — Anmeldung abschließen -> JWT wie beim Login

Entscheidungen : Passkeys sind "discoverable" (der Browser zeigt die Konten des Geräts an, es
muss keine E-Mail getippt werden), die Nutzer-Verifizierung (Biometrie/PIN) ist Pflicht. Damit
sind Besitz und Biometrie zwei Faktoren, die 2FA entfällt. Die Challenge liegt einmalig im
Cache (5 Minuten) und wird beim Prüfen verbraucht.
"""

import json
import secrets
from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.generics import get_object_or_404
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from . import services
from .models import Passkey
from .serializers import UserSerializer
from .views import _client_ip, _issue_tokens

CHALLENGE_TTL = 300  # 5 Minuten
MAX_PASSKEYS = 10


def rp_id() -> str:
    return settings.WEBAUTHN_RP_ID or (urlparse(settings.FRONTEND_URL).hostname or "localhost")


def erlaubte_origins() -> list[str]:
    return [settings.FRONTEND_URL.rstrip("/"), *settings.WEBAUTHN_EXTRA_ORIGINS]


def _reg_key(user) -> str:
    return f"passkey:reg:{user.id}"


def _login_key(challenge_id: str) -> str:
    return f"passkey:login:{challenge_id}"


def _credential_dict(data) -> dict:
    if not isinstance(data, dict) or "id" not in data or "response" not in data:
        raise ValidationError("Ungültige Passkey-Antwort.")
    return data


class PasskeyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "created_at": p.created_at,
                    "last_used_at": p.last_used_at,
                }
                for p in request.user.passkeys.all()
            ]
        )


class PasskeyDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        passkey = get_object_or_404(Passkey, pk=pk, user=request.user)
        passkey.delete()
        services.log_audit_event(
            "passkey_removed",
            user=request.user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasskeyRegisterOptionsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if user.passkeys.count() >= MAX_PASSKEYS:
            raise ValidationError(f"Maximal {MAX_PASSKEYS} Passkeys pro Konto.")
        options = generate_registration_options(
            rp_id=rp_id(),
            rp_name=settings.WEBAUTHN_RP_NAME,
            user_id=user.id.bytes,
            user_name=user.email,
            user_display_name=user.email,
            exclude_credentials=[
                PublicKeyCredentialDescriptor(id=bytes(p.credential_id))
                for p in user.passkeys.all()
            ],
            authenticator_selection=AuthenticatorSelectionCriteria(
                resident_key=ResidentKeyRequirement.REQUIRED,
                user_verification=UserVerificationRequirement.REQUIRED,
            ),
        )
        cache.set(_reg_key(user), options.challenge, CHALLENGE_TTL)
        return Response(json.loads(options_to_json(options)))


class PasskeyRegisterVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        credential = _credential_dict(request.data.get("credential"))
        challenge = cache.get(_reg_key(user))
        cache.delete(_reg_key(user))
        if challenge is None:
            raise ValidationError("Die Anfrage ist abgelaufen, bitte erneut versuchen.")
        if user.passkeys.count() >= MAX_PASSKEYS:
            raise ValidationError(f"Maximal {MAX_PASSKEYS} Passkeys pro Konto.")
        try:
            verified = verify_registration_response(
                credential=credential,
                expected_challenge=challenge,
                expected_rp_id=rp_id(),
                expected_origin=erlaubte_origins(),
                require_user_verification=True,
            )
        except InvalidRegistrationResponse:
            raise ValidationError("Der Passkey konnte nicht bestätigt werden.")
        if Passkey.objects.filter(credential_id=verified.credential_id).exists():
            raise ValidationError("Dieser Passkey ist bereits eingerichtet.")

        name = str(request.data.get("name") or "").strip()[:80] or "Passkey"
        transports = credential["response"].get("transports") or []
        passkey = Passkey.objects.create(
            user=user,
            credential_id=verified.credential_id,
            public_key=verified.credential_public_key,
            sign_count=verified.sign_count,
            name=name,
            transports=[str(t) for t in transports][:8],
        )
        services.log_audit_event(
            "passkey_added",
            user=user,
            ip_address=_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response(
            {"id": str(passkey.id), "name": passkey.name}, status=status.HTTP_201_CREATED
        )


class PasskeyLoginOptionsView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        options = generate_authentication_options(
            rp_id=rp_id(), user_verification=UserVerificationRequirement.REQUIRED
        )
        challenge_id = secrets.token_urlsafe(24)
        cache.set(_login_key(challenge_id), options.challenge, CHALLENGE_TTL)
        return Response(
            {"challenge_id": challenge_id, "options": json.loads(options_to_json(options))}
        )


class PasskeyLoginVerifyView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        credential = _credential_dict(request.data.get("credential"))
        challenge_id = str(request.data.get("challenge_id") or "")
        ip = _client_ip(request)
        agent = request.META.get("HTTP_USER_AGENT", "")

        challenge = cache.get(_login_key(challenge_id)) if challenge_id else None
        if challenge_id:
            cache.delete(_login_key(challenge_id))
        if challenge is None:
            raise AuthenticationFailed("Die Anfrage ist abgelaufen, bitte erneut versuchen.")

        try:
            raw_id = base64url_to_bytes(str(credential["id"]))
        except Exception:
            raise AuthenticationFailed("Passkey ungültig.")
        passkey = Passkey.objects.select_related("user").filter(credential_id=raw_id).first()
        if passkey is None:
            services.log_audit_event(
                "login_passkey_failed", ip_address=ip, user_agent=agent, grund="unbekannt"
            )
            raise AuthenticationFailed("Passkey ungültig.")

        user = passkey.user
        try:
            verified = verify_authentication_response(
                credential=credential,
                expected_challenge=challenge,
                expected_rp_id=rp_id(),
                expected_origin=erlaubte_origins(),
                credential_public_key=bytes(passkey.public_key),
                credential_current_sign_count=passkey.sign_count,
                require_user_verification=True,
            )
        except InvalidAuthenticationResponse:
            services.log_audit_event(
                "login_passkey_failed",
                user=user,
                ip_address=ip,
                user_agent=agent,
                grund="ungueltig",
            )
            raise AuthenticationFailed("Passkey ungültig.")

        if not user.is_active:
            return Response(
                {
                    "code": "account_inactive",
                    "message": "Votre compte est en attente de validation par un RH ou Admin.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        passkey.sign_count = verified.new_sign_count
        passkey.last_used_at = timezone.now()
        passkey.save(update_fields=["sign_count", "last_used_at"])

        device_raw = str(request.data.get("device_id") or "")
        device_hash = services.fingerprint_hash(device_raw) if device_raw else None
        user.mark_login(ip)
        tokens = _issue_tokens(user, device_hash, request)
        services.log_audit_event(
            "login_passkey_success", user=user, ip_address=ip, user_agent=agent
        )
        return Response({**tokens, "user": UserSerializer(user).data})

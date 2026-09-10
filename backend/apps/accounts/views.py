"""
Vues API — app accounts (TDD §2.4) :
  POST /auth/login/                 — étape 1 : email+mdp -> ticket ou tokens
  POST /auth/2fa/send-otp/          — envoie un code email (méthode de secours)
  POST /auth/2fa/verify/            — étape 2 : code TOTP/email -> tokens JWT
  POST /auth/register/              — inscription membre (compte inactif)
  GET/PATCH /auth/me/                — profil de l'utilisateur connecté
  GET/POST/DELETE /auth/2fa/totp/    — setup / statut / désactivation TOTP
  POST /auth/logout/                 — blackliste le refresh token
"""

import base64
import io

import qrcode
from django.contrib.auth import authenticate
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from . import services
from .serializers import (
    LoginSerializer,
    RegisterSerializer,
    SendOTPSerializer,
    TOTPSetupConfirmSerializer,
    User,
    UserSerializer,
    Verify2FASerializer,
)
from .tasks import send_new_ip_alert_email, send_otp_email, send_welcome_email

LOGIN_TICKET_SALT = "cid.accounts.login_ticket"
LOGIN_TICKET_MAX_AGE = 300  # 5 minutes


def _client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _issue_tokens(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class LoginView(APIView):
    """Étape 1 de connexion — vérifie les identifiants, évalue le besoin de 2FA."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = authenticate(request, username=data["email"], password=data["password"])
        if user is None:
            raise AuthenticationFailed("Email ou mot de passe incorrect.")

        if not user.is_active:
            return Response(
                {
                    "code": "account_inactive",
                    "message": "Votre compte est en attente de validation par un RH ou Admin.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        ip = _client_ip(request)
        fp_raw = data.get("device_fingerprint", "")
        fp_hash = services.fingerprint_hash(fp_raw) if fp_raw else None

        if services.requires_2fa(user, ip, fp_hash):
            ticket = signing.dumps(
                {"user_id": str(user.id), "ip": ip, "fp": fp_hash},
                salt=LOGIN_TICKET_SALT,
            )
            services.log_audit_event(
                "login_2fa_required",
                user=user,
                ip_address=ip,
                user_agent=request.META.get("HTTP_USER_AGENT", ""),
            )
            return Response(
                {
                    "requires_2fa": True,
                    "login_ticket": ticket,
                    "totp_available": services.user_has_totp(user),
                },
                status=status.HTTP_200_OK,
            )

        user.mark_login(ip)
        tokens = _issue_tokens(user)
        services.log_audit_event(
            "login_success",
            user=user,
            ip_address=ip,
            user_agent=request.META.get("HTTP_USER_AGENT", ""),
        )
        return Response({**tokens, "user": UserSerializer(user).data})


def _unpack_ticket(ticket: str) -> dict:
    try:
        return signing.loads(ticket, salt=LOGIN_TICKET_SALT, max_age=LOGIN_TICKET_MAX_AGE)
    except SignatureExpired:
        raise ValidationError("Le ticket de connexion a expiré, reconnectez-vous.")
    except BadSignature:
        raise ValidationError("Ticket de connexion invalide.")


class SendOTPView(APIView):
    """Envoie un code OTP par email pour l'utilisateur du ticket de connexion."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = SendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = _unpack_ticket(serializer.validated_data["login_ticket"])
        user = generics.get_object_or_404(User, id=payload["user_id"])

        try:
            code = services.generate_email_otp(user)
        except ValueError as exc:
            return Response({"code": "otp_rate_limited", "message": str(exc)}, status=429)

        send_otp_email.delay(str(user.id), code)
        return Response({"message": "Code envoyé par email."})


class Verify2FAView(APIView):
    """Étape 2 — vérifie le code TOTP ou email OTP et délivre les tokens JWT."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = Verify2FASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        payload = _unpack_ticket(data["login_ticket"])
        user = generics.get_object_or_404(User, id=payload["user_id"])

        if data["method"] == "totp":
            device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
            valid = bool(device) and device.verify_token(data["code"])
        else:
            valid = services.verify_email_otp(user, data["code"])

        if not valid:
            services.log_audit_event(
                "login_2fa_failed",
                user=user,
                ip_address=payload.get("ip"),
                metadata={"method": data["method"]},
            )
            raise AuthenticationFailed("Code de vérification invalide.")

        ip = payload.get("ip", "")
        new_ip = user.last_known_ip and user.last_known_ip != ip
        user.trusted_device_token = payload.get("fp") or user.trusted_device_token
        user.mark_login(ip)

        if new_ip:
            send_new_ip_alert_email.delay(str(user.id), ip)

        tokens = _issue_tokens(user)
        services.log_audit_event(
            "login_2fa_success", user=user, ip_address=ip, metadata={"method": data["method"]}
        )
        return Response({**tokens, "user": UserSerializer(user).data})


class RegisterView(generics.CreateAPIView):
    """Inscription membre (FDD §3.1, F-002) — compte créé inactif."""

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        send_welcome_email.delay(str(user.id))
        services.log_audit_event("register", user=user, ip_address=_client_ip(request))
        return Response(
            {"message": "Inscription reçue. Votre compte doit être activé par un administrateur."},
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class TOTPSetupView(APIView):
    """Configuration du 2FA TOTP (F-010) : QR code, confirmation, désactivation."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        has_confirmed = services.user_has_totp(request.user)
        return Response({"totp_enabled": has_confirmed})

    def post(self, request):
        """Crée un device TOTP non confirmé et renvoie le QR code (base64 PNG)."""
        TOTPDevice.objects.filter(user=request.user, confirmed=False).delete()
        device = TOTPDevice.objects.create(user=request.user, name="default", confirmed=False)
        # django-otp génère et stocke le secret ; config_url fournit l'URI
        # otpauth:// standard (scannable par Google Authenticator, Aegis, ...)
        key_b32 = device.config_url
        img = qrcode.make(key_b32)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        qr_b64 = base64.b64encode(buf.getvalue()).decode()

        return Response(
            {
                "qr_code_base64": qr_b64,
                "otpauth_url": key_b32,
                "message": "Scannez le QR code puis confirmez avec un code à 6 chiffres.",
            }
        )

    def delete(self, request):
        TOTPDevice.objects.filter(user=request.user).delete()
        services.log_audit_event("totp_disabled", user=request.user, ip_address=_client_ip(request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class TOTPConfirmView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = TOTPSetupConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        device = TOTPDevice.objects.filter(user=request.user, confirmed=False).first()
        if not device or not device.verify_token(serializer.validated_data["code"]):
            raise ValidationError("Code invalide — vérifiez votre application d'authentification.")
        device.confirmed = True
        device.save(update_fields=["confirmed"])
        services.log_audit_event("totp_enabled", user=request.user, ip_address=_client_ip(request))
        return Response({"message": "2FA TOTP activé avec succès."})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            raise ValidationError("Le token 'refresh' est requis.")
        try:
            RefreshToken(refresh_token).blacklist()
        except TokenError:
            pass
        services.log_audit_event("logout", user=request.user, ip_address=_client_ip(request))
        return Response(status=status.HTTP_205_RESET_CONTENT)

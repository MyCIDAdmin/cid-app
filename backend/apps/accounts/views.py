"""
Vues API — app accounts (TDD §2.4) :
  POST /auth/login/                 — étape 1 : email+mdp -> ticket ou tokens
  POST /auth/2fa/send-otp/          — envoie un code email (méthode de secours)
  POST /auth/2fa/verify/            — étape 2 : code TOTP/email -> tokens JWT
  POST /auth/register/              — inscription membre (compte + fiche Membre inactifs)
  POST /auth/register/confirm/      — confirme le code reçu par email (AHM-50)
  POST /auth/register/resend-code/  — renvoie un nouveau code de confirmation
  GET/PATCH /auth/me/                — profil de l'utilisateur connecté
  GET/POST/DELETE /auth/2fa/totp/    — setup / statut / désactivation TOTP
  POST /auth/logout/                 — blackliste le refresh token
  POST /auth/password-reset/         — demande un lien de réinitialisation
  POST /auth/password-reset/confirm/ — consomme le lien, fixe le nouveau mdp
  GET  /auth/pending-registrations/          — liste des inscriptions en attente (RH+)
  POST /auth/pending-registrations/{id}/approve/ — active le compte (RH+)
  POST /auth/pending-registrations/{id}/refuse/  — refuse l'inscription (RH+)
  GET  /auth/users/                      — liste/recherche des comptes (Admin App, SCD §4.2)
  POST /auth/users/{id}/changer_role/    — change le rôle d'un compte (Admin App, SCD §4.2/§8.1)
"""

import base64
import io

import qrcode
from django.contrib.auth import authenticate
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.db import transaction
from django.db.models import Q
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework import generics, status
from rest_framework.exceptions import AuthenticationFailed, ValidationError
from rest_framework.pagination import CursorPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.membres.models import StatutMembre

from . import services
from .models import RegistrationDecision, Role
from .permissions import HasInscriptionsAdminAccess, HasInscriptionsAdminWriteAccess, IsSuperAdmin
from .serializers import (
    ChangeRoleSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PendingRegistrationSerializer,
    RegisterConfirmSerializer,
    RegisterResendCodeSerializer,
    RegisterSerializer,
    SendOTPSerializer,
    TOTPSetupConfirmSerializer,
    User,
    UserManagementSerializer,
    UserSerializer,
    Verify2FASerializer,
)
from .tasks import (
    notifier_nouvelle_inscription_rh,
    send_email_verification_code,
    send_new_ip_alert_email,
    send_otp_email,
    send_password_reset_email,
    send_registration_approved_email,
    send_registration_refused_email,
    send_welcome_email,
)

LOGIN_TICKET_SALT = "cid.accounts.login_ticket"
LOGIN_TICKET_MAX_AGE = 300  # 5 minutes


def _client_ip(request) -> str:
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


def _issue_tokens(user: User, device_hash: str | None = None) -> dict:
    """Émet les tokens JWT. `device_hash` (hash de `LoginSerializer.device_id`, distinct de
    `device_fingerprint`/2FA — voir ce serializer) : si fourni, applique d'abord "une seule
    session active par appareil" (retour utilisateur du 2026-09-24, task #218) : toute session
    encore active sur CE MÊME appareil est révoquée avant l'émission de la nouvelle — voir
    services.enforce_single_session_per_device."""
    if device_hash:
        revoked = services.enforce_single_session_per_device(user, device_hash)
        if revoked:
            services.log_audit_event("device_sessions_revoked", user=user, count=revoked)

    refresh = RefreshToken.for_user(user)
    refresh["role"] = user.role
    services.track_device_session(user, refresh, device_hash)
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

        # `device_id` (task #218) : identifiant de session distinct de `device_fingerprint`
        # ci-dessus — voir LoginSerializer pour la raison de cette séparation.
        device_id_raw = data.get("device_id", "")
        device_hash = services.fingerprint_hash(device_id_raw) if device_id_raw else None

        if services.requires_2fa(user, ip, fp_hash):
            ticket = signing.dumps(
                {"user_id": str(user.id), "ip": ip, "fp": fp_hash, "did": device_hash},
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
        tokens = _issue_tokens(user, device_hash)
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

        tokens = _issue_tokens(user, payload.get("did"))
        services.log_audit_event(
            "login_2fa_success", user=user, ip_address=ip, metadata={"method": data["method"]}
        )
        return Response({**tokens, "user": UserSerializer(user).data})


class RegisterView(generics.CreateAPIView):
    """
    Inscription membre (FDD §3.1, F-002, AHM-50) — crée le compte ET la
    fiche Membre (statut en_attente), tous deux inactifs. La prochaine
    étape est la confirmation du code reçu par email (RegisterConfirmView)
    — RH ne voit la demande qu'une fois l'email confirmé.
    """

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            user = serializer.save()
            # Attribution automatique du rôle "Membre Normal" (demande utilisateur du
            # 2026-09-23 : "Ein neuer Benutzer erhält nach Genehmigung die Rolle Normales
            # Mitglieder") — import différé pour éviter tout couplage au chargement du module
            # (apps.rbac dépend de apps.accounts, jamais l'inverse, voir apps.rbac.apps).
            # `get_or_create` : idempotent, et le CharField `user.role` legacy vaut de toute
            # façon déjà "membre" par défaut du modèle (voir services.get_user_role_slugs qui
            # l'inclut systématiquement) — cette ligne ne fait qu'ajouter la ligne d'attribution
            # explicite pour que la nouvelle UI de gestion des rôles la voie immédiatement.
            from apps.rbac.models import RoleDefinition, UserRoleAssignment

            role_membre = RoleDefinition.objects.filter(slug=Role.MEMBRE, is_system=True).first()
            if role_membre:
                UserRoleAssignment.objects.get_or_create(user=user, role=role_membre)
        code = services.generate_email_otp(user, purpose="email_verification")
        send_email_verification_code.delay(str(user.id), code)
        services.log_audit_event("register", user=user, ip_address=_client_ip(request))
        return Response(
            {
                "message": (
                    "Inscription reçue. Un code de vérification vient d'être envoyé à "
                    "votre adresse email."
                )
            },
            status=status.HTTP_201_CREATED,
        )


class RegisterConfirmView(APIView):
    """Confirme le code à 6 chiffres reçu par email après l'inscription (AHM-50)."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = RegisterConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = User.objects.filter(email__iexact=data["email"]).first()
        if user is None or not services.verify_email_otp(
            user, data["code"], purpose="email_verification"
        ):
            raise ValidationError("Code invalide ou expiré.")

        # Demande utilisateur du 2026-10-05 (point 2) : plus de validation RH/Admin de
        # l'inscription — l'email confirmé suffit pour se connecter. Le compte reste un
        # "non-membre" (fiche Membre EN_ATTENTE) tant que son adhésion n'est pas approuvée ET
        # payée (voir apps.cotisations.notifications.notifier_paiement_confirme).
        user.email_verifie = True
        if user.registration_decision == RegistrationDecision.EN_ATTENTE:
            user.is_active = True
            user.registration_decision = RegistrationDecision.APPROUVE
        user.save(update_fields=["email_verifie", "is_active", "registration_decision"])
        send_welcome_email.delay(str(user.id))
        # Notification staff conservée (information, plus aucune action requise).
        notifier_nouvelle_inscription_rh.delay(str(user.id))
        services.log_audit_event("email_verified", user=user, ip_address=_client_ip(request))
        return Response({"message": "Email confirmé. Vous pouvez maintenant vous connecter."})


class RegisterResendCodeView(APIView):
    """
    Renvoie un nouveau code de confirmation (AHM-50). Réponse volontairement
    identique que l'email corresponde à un compte non confirmé ou non —
    anti-énumération, même principe que PasswordResetRequestView.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        serializer = RegisterResendCodeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.filter(
            email__iexact=serializer.validated_data["email"], email_verifie=False
        ).first()
        if user is not None:
            try:
                code = services.generate_email_otp(user, purpose="email_verification")
            except ValueError:
                # limite anti-spam atteinte (OTP_EMAIL_MAX_PER_10MIN) — réponse générique quand même
                pass
            else:
                send_email_verification_code.delay(str(user.id), code)

        return Response(
            {
                "message": (
                    "Si un compte en attente de confirmation existe, un nouveau code vient "
                    "d'être envoyé."
                )
            }
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


class PasswordResetRequestView(APIView):
    """
    Demande de réinitialisation (FDD §3.1). La réponse est volontairement
    identique que l'email corresponde à un compte ou non — ne pas
    permettre l'énumération des adresses inscrites (SCD).
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.filter(email__iexact=serializer.validated_data["email"]).first()
        if user is not None:
            token = services.generate_password_reset_token(user)
            send_password_reset_email.delay(str(user.id), token)
            services.log_audit_event(
                "password_reset_requested", user=user, ip_address=_client_ip(request)
            )

        return Response(
            {
                "message": (
                    "Si un compte existe avec cet email, un lien de réinitialisation "
                    "vient d'être envoyé."
                )
            }
        )


class PasswordResetConfirmView(APIView):
    """Consomme le jeton reçu par email et fixe le nouveau mot de passe."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = services.verify_password_reset_token(data["token"])
        user.set_password(data["new_password"])
        user.save(update_fields=["password"])
        services.log_audit_event(
            "password_reset_confirmed", user=user, ip_address=_client_ip(request)
        )
        return Response({"message": "Mot de passe réinitialisé avec succès."})


class PendingRegistrationsCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("created_at", "id")


class PendingRegistrationsView(generics.ListAPIView):
    """
    Liste des inscriptions libre-service en attente de décision (AHM-48).
    Le décompte `is_active=False` seul est ambigu (un compte peut aussi
    être désactivé manuellement) — on filtre donc aussi sur
    `registration_decision=EN_ATTENTE`.
    """

    # Page de gestion "Registrierungen" (Phase D, ajoutée le 2026-09-23, slug
    # `page_inscriptions`) — remplace IsRHOrAbove ICI UNIQUEMENT (voir docstring de
    # HasInscriptionsAdminAccess) ; IsRHOrAbove reste inchangé pour membres import/export.
    permission_classes = [HasInscriptionsAdminAccess]
    serializer_class = PendingRegistrationSerializer
    pagination_class = PendingRegistrationsCursorPagination

    def get_queryset(self):
        # email_verifie=True (AHM-50) : une inscription dont l'email n'est
        # pas encore confirmé n'est pas une vraie demande à traiter par RH.
        return (
            User.objects.filter(
                is_active=False,
                registration_decision=RegistrationDecision.EN_ATTENTE,
                email_verifie=True,
            )
            .select_related("membre")
            .order_by("created_at", "id")
        )


class UsersCursorPagination(CursorPagination):
    page_size = 20
    ordering = ("created_at", "id")


class UsersListView(generics.ListAPIView):
    """
    Liste/recherche des comptes utilisateurs, réservée à l'Admin App (SCD
    §4.2 : `GET /admin/rôles/`) — sert à retrouver un compte (ex. Abir,
    après son inscription libre-service et sa validation par RH) avant de
    lui changer de rôle via ChangeUserRoleView. Recherche simple sur
    email/prénom/nom via `?q=`.
    """

    permission_classes = [IsSuperAdmin]
    serializer_class = UserManagementSerializer
    pagination_class = UsersCursorPagination

    def get_queryset(self):
        qs = User.objects.select_related("membre").order_by("created_at", "id")
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(
                Q(email__icontains=q) | Q(membre__prenom__icontains=q) | Q(membre__nom__icontains=q)
            )
        return qs


class ChangeUserRoleView(APIView):
    """
    Change le rôle d'un utilisateur (SCD §4.2, réservé Admin App). Journalisé
    dans AuditLogEntry via log_audit_event (ancien/nouveau rôle, acteur,
    cible, horodatage), conformément à SCD §8.1 (rétention 24 mois).
    Un Admin App ne peut pas changer son propre rôle — garde-fou contre un
    auto-verrouillage accidentel (il n'y a qu'un seul rôle avec ce niveau
    d'accès).
    """

    permission_classes = [IsSuperAdmin]

    def post(self, request, pk):
        serializer = ChangeRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        nouveau_role = serializer.validated_data["role"]

        target = User.objects.filter(pk=pk).first()
        if target is None:
            raise ValidationError("Utilisateur introuvable.")

        if target.id == request.user.id:
            raise ValidationError("Vous ne pouvez pas changer votre propre rôle.")

        ancien_role = target.role
        if ancien_role == nouveau_role:
            raise ValidationError("Ce compte a déjà ce rôle.")

        target.role = nouveau_role
        target.save(update_fields=["role"])

        services.log_audit_event(
            "role_changed",
            user=target,
            ip_address=_client_ip(request),
            decided_by=str(request.user.id),
            ancien_role=ancien_role,
            nouveau_role=nouveau_role,
        )
        return Response(UserManagementSerializer(target).data)


class ApproveRegistrationView(APIView):
    """
    Active le compte ET la fiche Membre créée à l'inscription (FDD §3.1,
    AHM-50 — la fiche existe déjà, statut `en_attente`, depuis
    RegisterSerializer.create ; il n'y a donc plus de création/liaison
    manuelle séparée à faire ici).
    """

    # Page de gestion "Registrierungen" (Phase D, ajoutée le 2026-09-23, slug
    # `page_inscriptions`) — remplace IsRHOrAbove ICI UNIQUEMENT (voir docstring de
    # HasInscriptionsAdminAccess) ; IsRHOrAbove reste inchangé pour membres import/export.
    # HasInscriptionsAdminWriteAccess (lecture_ecriture requis) depuis le 2026-09-24 — approuver
    # une inscription est une action de gestion, pas une simple consultation.
    permission_classes = [HasInscriptionsAdminWriteAccess]

    def post(self, request, pk):
        target = User.objects.filter(
            pk=pk,
            is_active=False,
            registration_decision=RegistrationDecision.EN_ATTENTE,
            email_verifie=True,
        ).first()
        if target is None:
            raise ValidationError("Inscription introuvable ou déjà traitée.")

        target.is_active = True
        target.registration_decision = RegistrationDecision.APPROUVE
        target.save(update_fields=["is_active", "registration_decision"])

        membre = getattr(target, "membre", None)
        if membre is not None:
            membre.statut = StatutMembre.ACTIF
            membre.save(update_fields=["statut"])

        send_registration_approved_email.delay(str(target.id))
        services.log_audit_event(
            "registration_approved",
            user=target,
            ip_address=_client_ip(request),
            decided_by=str(request.user.id),
        )
        return Response(UserSerializer(target).data)


class RefuseRegistrationView(APIView):
    """
    Refuse l'inscription (FDD §3.1) — le compte reste inactif. La fiche
    Membre créée à l'inscription est conservée avec le statut `inactif`
    plutôt que supprimée (décision utilisateur, 2026-09-11) : RH garde une
    trace de la demande et peut la supprimer manuellement si besoin
    (DELETE /membres/{id}/, déjà réservé Bureau Admin+).
    """

    # Page de gestion "Registrierungen" (Phase D, ajoutée le 2026-09-23, slug
    # `page_inscriptions`) — remplace IsRHOrAbove ICI UNIQUEMENT (voir docstring de
    # HasInscriptionsAdminAccess) ; IsRHOrAbove reste inchangé pour membres import/export.
    # HasInscriptionsAdminWriteAccess (lecture_ecriture requis) depuis le 2026-09-24 — refuser
    # une inscription est une action de gestion, pas une simple consultation.
    permission_classes = [HasInscriptionsAdminWriteAccess]

    def post(self, request, pk):
        target = User.objects.filter(
            pk=pk,
            is_active=False,
            registration_decision=RegistrationDecision.EN_ATTENTE,
            email_verifie=True,
        ).first()
        if target is None:
            raise ValidationError("Inscription introuvable ou déjà traitée.")

        target.registration_decision = RegistrationDecision.REFUSE
        target.save(update_fields=["registration_decision"])

        membre = getattr(target, "membre", None)
        if membre is not None:
            membre.statut = StatutMembre.INACTIF
            membre.save(update_fields=["statut"])

        send_registration_refused_email.delay(str(target.id))
        services.log_audit_event(
            "registration_refused",
            user=target,
            ip_address=_client_ip(request),
            decided_by=str(request.user.id),
        )
        return Response(UserSerializer(target).data)


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

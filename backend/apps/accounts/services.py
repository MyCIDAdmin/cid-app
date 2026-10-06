"""
Logique métier 2FA — conditionnel pour les membres, obligatoire pour les
rôles >= Bureau Admin (SCD §3.2/§3.3, FDD §3.1, E-001 du RICEFW).
"""

import hashlib
import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired
from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.exceptions import ValidationError

from .models import AuditLogEntry, EmailOTP

User = get_user_model()

# Réinitialisation de mot de passe (FDD §3.1 : "lien email sécurisé, valide
# 1h, usage unique"). Même mécanisme que le login_ticket (apps.accounts.views)
# — un jeton signé et daté par django.core.signing, sans table dédiée. Le
# caractère "usage unique" est obtenu en liant le jeton à une empreinte du
# hash de mot de passe courant : dès que le mot de passe change (par ce
# jeton ou par un autre moyen), tout jeton émis avant devient invalide.
PASSWORD_RESET_SALT = "cid.accounts.password_reset"
PASSWORD_RESET_MAX_AGE_SECONDS = 3600


def users_role_at_least(min_level: int):
    """Tous les comptes actifs dont le rôle a un niveau RBAC >= `min_level` (voir ROLE_LEVELS) —
    ajouté le 2026-09-16 pour les notifications in-app "staff" (nouvel élément en attente de
    validation) diffusées à tout un rôle et au-dessus, plutôt qu'à un destinataire précis : voir
    apps.adhesions.notifications (justificatif soumis), apps.accounts.tasks (nouvelle
    inscription), apps.cotisations.notifications (paiement en attente),
    apps.boutique.notifications (nouvelle commande)."""
    from .models import ROLE_LEVELS

    roles_eligibles = [role for role, niveau in ROLE_LEVELS.items() if niveau >= min_level]
    return User.objects.filter(role__in=roles_eligibles, is_active=True)


def log_audit_event(action: str, user=None, ip_address=None, user_agent="", **metadata):
    """Trace un événement de sécurité — jamais de données sensibles (SCD §8.1)."""
    AuditLogEntry.objects.create(
        user=user,
        action=action,
        ip_address=ip_address,
        user_agent=user_agent[:255],
        metadata=metadata,
    )


def requires_2fa(user, request_ip: str, device_fingerprint_hash: str | None) -> bool:
    """
    Détermine si le 2FA doit être déclenché pour cette connexion
    (SCD §3.3) :
      - obligatoire pour rôle >= Bureau Admin ou si require_2fa=True
      - conditionnel pour un Membre Normal : nouvelle IP, nouveau device,
        ou > 30 jours depuis la dernière connexion réussie
    """
    if user.two_fa_mandatory:
        return True

    if user.last_known_ip and user.last_known_ip != request_ip:
        return True

    if device_fingerprint_hash and user.trusted_device_token != device_fingerprint_hash:
        return True

    # Délai > 30 jours depuis la dernière connexion réussie (SCD §3.3).
    # Un compte qui ne s'est encore jamais connecté n'a, par définition,
    # aucune IP/empreinte de confiance enregistrée — les deux conditions
    # ci-dessus l'auront déjà couvert dès que last_known_ip est renseigné.
    if user.last_successful_login is not None and (
        timezone.now() - user.last_successful_login > timedelta(days=30)
    ):
        return True

    return False


def user_has_totp(user) -> bool:
    return TOTPDevice.objects.filter(user=user, confirmed=True).exists()


def generate_email_otp(user, purpose: str = "login_2fa") -> str:
    """Génère un OTP 6 chiffres, stocke son hash, retourne le code en clair
    (à transmettre uniquement à la tâche Celery d'envoi email — jamais loggé)."""
    recent_count = EmailOTP.objects.filter(
        user=user,
        purpose=purpose,
        created_at__gte=timezone.now() - timedelta(minutes=10),
    ).count()
    if recent_count >= settings.OTP_EMAIL_MAX_PER_10MIN:
        raise ValueError("Trop de demandes de code — réessayez plus tard.")

    code = f"{random.randint(0, 999999):06d}"
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    EmailOTP.objects.create(
        user=user,
        code_hash=code_hash,
        purpose=purpose,
        expires_at=timezone.now() + timedelta(minutes=settings.OTP_EMAIL_TTL_MIN),
    )
    return code


def verify_email_otp(user, code: str, purpose: str = "login_2fa") -> bool:
    code_hash = hashlib.sha256(code.encode()).hexdigest()
    otp = (
        EmailOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if otp is None or not otp.is_valid:
        return False

    otp.attempts += 1
    otp.save(update_fields=["attempts"])
    if otp.attempts > 3:
        return False

    if otp.code_hash != code_hash:
        return False

    otp.consumed_at = timezone.now()
    otp.save(update_fields=["consumed_at"])
    return True


def fingerprint_hash(raw_fingerprint: str) -> str:
    return hashlib.sha256(raw_fingerprint.encode()).hexdigest()


def enforce_single_session_per_device(user, device_fingerprint_hash: str | None) -> int:
    """
    Révoque (blackliste) tous les refresh tokens encore actifs de `user` sur
    CE MÊME appareil (même empreinte) — une seule session active par
    appareil (retour utilisateur du 2026-09-24). N'affecte jamais les
    sessions d'un AUTRE appareil : un membre connecté à la fois sur son
    téléphone et son ordinateur garde les deux — seul un doublon sur le
    même appareil (onglet oublié ouvert, reconnexion) est visé.

    Le refresh token révoqué reste valable jusqu'à sa prochaine utilisation
    (le blacklist n'est vérifié qu'au refresh, jamais sur l'access token en
    cours — même mécanisme que LogoutView) : la session concernée se
    termine donc au plus tard à l'expiration de son access token courant
    (JWT_ACCESS_TOKEN_LIFETIME_MIN, 15 min par défaut).

    Sans empreinte (client qui n'en envoie pas), impossible de déterminer
    "le même appareil" en toute sécurité — on ne révoque rien, comme pour la
    détection "nouvel appareil" du 2FA conditionnel (requires_2fa ci-dessus).
    Retourne le nombre de sessions révoquées (pour l'audit log).
    """
    if not device_fingerprint_hash:
        return 0

    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    a_revoquer = OutstandingToken.objects.filter(
        device_session__user=user,
        device_session__device_fingerprint_hash=device_fingerprint_hash,
        expires_at__gt=timezone.now(),
        blacklistedtoken__isnull=True,
    )

    count = 0
    for token in a_revoquer:
        BlacklistedToken.objects.create(token=token)
        count += 1
    return count


def track_device_session(
    user,
    refresh_token,
    device_fingerprint_hash: str | None,
    user_agent: str = "",
    ip_address: str | None = None,
) -> None:
    """
    Enregistre l'empreinte d'appareil du refresh token qui vient d'être émis
    — permet à la PROCHAINE connexion sur ce même appareil de le retrouver
    via enforce_single_session_per_device ci-dessus. `refresh_token` est le
    `RefreshToken` (simplejwt) tout juste créé par `RefreshToken.for_user` —
    son OutstandingToken correspondant existe donc déjà (créé
    automatiquement par BlacklistMixin.for_user). Sans empreinte, rien à
    enregistrer (voir enforce_single_session_per_device).
    """
    if not device_fingerprint_hash:
        return

    from rest_framework_simplejwt.settings import api_settings
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

    from .models import DeviceSession

    jti = refresh_token[api_settings.JTI_CLAIM]
    outstanding = OutstandingToken.objects.get(jti=jti)
    DeviceSession.objects.create(
        user=user,
        outstanding_token=outstanding,
        device_fingerprint_hash=device_fingerprint_hash,
        user_agent=(user_agent or "")[:255],
        ip_address=ip_address or None,
    )


def rotate_device_session(old_refresh: str, new_refresh: str) -> None:
    """
    Nach einem Token-Refresh (ROTATE_REFRESH_TOKENS) trägt das neue Refresh-Token noch keine
    OutstandingToken-Zeile und gehört damit zu keiner DeviceSession — ohne diese Übernahme
    würde die Gerätesitzung nach dem ersten Refresh "verschwinden" (weder in der Geräteliste
    noch für das 3-Geräte-Limit auffindbar). Wir legen den OutstandingToken des neuen Tokens an
    und hängen die bestehende DeviceSession des alten Tokens dort um; ohne DeviceSession
    (Client ohne device_id) passiert nichts.
    """
    from rest_framework_simplejwt.settings import api_settings
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
    from rest_framework_simplejwt.tokens import RefreshToken
    from rest_framework_simplejwt.utils import datetime_from_epoch

    from .models import DeviceSession

    old_jti = RefreshToken(old_refresh, verify=False)[api_settings.JTI_CLAIM]
    session = DeviceSession.objects.filter(outstanding_token__jti=old_jti).first()
    if session is None:
        return

    neu = RefreshToken(new_refresh, verify=False)
    outstanding, _ = OutstandingToken.objects.get_or_create(
        jti=neu[api_settings.JTI_CLAIM],
        defaults={
            "user": session.user,
            "token": new_refresh,
            "expires_at": datetime_from_epoch(neu["exp"]),
        },
    )
    session.outstanding_token = outstanding
    session.last_seen_at = timezone.now()
    session.save(update_fields=["outstanding_token", "last_seen_at"])


def active_device_sessions(user):
    """Aktive Gerätesitzungen: Refresh-Token weder abgelaufen noch auf der Blacklist."""
    from .models import DeviceSession

    return DeviceSession.objects.filter(
        user=user,
        outstanding_token__expires_at__gt=timezone.now(),
        outstanding_token__blacklistedtoken__isnull=True,
    )


def revoke_device(user, device_fingerprint_hash: str) -> int:
    """Meldet ein Gerät ab: blacklistet alle aktiven Refresh-Token dieses Geräts."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

    count = 0
    for session in active_device_sessions(user).filter(
        device_fingerprint_hash=device_fingerprint_hash
    ):
        BlacklistedToken.objects.get_or_create(token=session.outstanding_token)
        count += 1
    return count


def enforce_max_devices(user, current_hash: str | None, limit: int | None = None) -> int:
    """
    Höchstens `limit` (Standard settings.MAX_ACTIVE_DEVICES = 3) aktive Geräte pro Benutzer.
    Meldet sich ein weiteres Gerät an, werden die am längsten inaktiven Geräte abgemeldet, bis
    inklusive des neuen Geräts höchstens `limit` übrig sind. Das aktuelle Gerät zählt immer als
    behalten. Ohne device_id (current_hash leer) wird nichts erzwungen. Gibt die Anzahl der
    abgemeldeten Geräte zurück (für das Audit-Log).
    """
    if not current_hash:
        return 0
    limit = limit or settings.MAX_ACTIVE_DEVICES

    letzte_aktivitaet: dict[str, object] = {}
    for session in active_device_sessions(user).exclude(device_fingerprint_hash=current_hash):
        h = session.device_fingerprint_hash
        if h not in letzte_aktivitaet or session.last_seen_at > letzte_aktivitaet[h]:
            letzte_aktivitaet[h] = session.last_seen_at

    freie_plaetze = limit - 1  # ein Platz gehört dem aktuellen Gerät
    if len(letzte_aktivitaet) <= freie_plaetze:
        return 0

    neueste_zuerst = sorted(letzte_aktivitaet.items(), key=lambda kv: kv[1], reverse=True)
    abgemeldet = 0
    for h, _ in neueste_zuerst[freie_plaetze:]:
        revoke_device(user, h)
        abgemeldet += 1
    return abgemeldet


def _password_fingerprint(user) -> str:
    """
    Empreinte à sens unique du hash de mot de passe courant — jamais le hash
    lui-même (SCD §10.1 : pas de secret exposé, même signé) — sert juste à
    détecter qu'un lien de réinitialisation a déjà été consommé.
    """
    return hashlib.sha256(user.password.encode()).hexdigest()[:16]


def generate_password_reset_token(user) -> str:
    return signing.dumps(
        {"user_id": str(user.id), "pwd_fp": _password_fingerprint(user)},
        salt=PASSWORD_RESET_SALT,
    )


def verify_password_reset_token(token: str):
    """
    Retourne l'utilisateur si le jeton est valide ; lève ValidationError sinon
    (signature invalide, expiré, ou déjà consommé — mot de passe changé
    depuis l'émission du jeton).
    """
    try:
        payload = signing.loads(
            token, salt=PASSWORD_RESET_SALT, max_age=PASSWORD_RESET_MAX_AGE_SECONDS
        )
    except SignatureExpired:
        raise ValidationError("Ce lien de réinitialisation a expiré.")
    except BadSignature:
        raise ValidationError("Ce lien de réinitialisation est invalide.")

    user = User.objects.filter(id=payload.get("user_id")).first()
    if user is None or _password_fingerprint(user) != payload.get("pwd_fp"):
        raise ValidationError("Ce lien de réinitialisation est invalide ou a déjà été utilisé.")
    return user

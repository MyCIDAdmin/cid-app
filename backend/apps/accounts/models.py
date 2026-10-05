"""
Modèles — app accounts.

User model personnalisé avec 5 rôles RBAC (FDD §2.1) et champs de sécurité
pour le 2FA conditionnel (SCD §3.3). Le secret TOTP lui-même est géré par
django_otp (apps.accounts.INSTALLED_APPS -> django_otp.plugins.otp_totp) —
pas dupliqué ici.
"""

import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from encrypted_model_fields.fields import EncryptedCharField


class Role(models.TextChoices):
    """5 rôles RBAC — niveaux 1 à 5, voir FDD §2.1 / SCD §4.1."""

    MEMBRE = "membre", _("Membre Normal")
    RH = "rh", _("Ressources Humaines")
    BUREAU_ADMIN = "bureau_admin", _("Membre Bureau Administratif")
    DIR_FINANCIER = "dir_financier", _("Directeur Financier")
    SUPER_ADMIN = "super_admin", _("Administrateur App")


# Niveau numérique par rôle — utilisé par les permissions "RoleOrAbove"
ROLE_LEVELS = {
    Role.MEMBRE: 1,
    Role.RH: 2,
    Role.BUREAU_ADMIN: 3,
    Role.DIR_FINANCIER: 4,
    Role.SUPER_ADMIN: 5,
}

# 2FA obligatoire pour les rôles >= Bureau Admin (niveau 3), SCD §3.2
ROLE_2FA_MANDATORY_MIN_LEVEL = 3


class RegistrationDecision(models.TextChoices):
    """
    Décision RH/Admin sur une inscription libre-service (FDD §3.1, AHM-48).
    Distinct de `is_active` : un compte peut être inactif pour d'autres
    raisons (désactivation manuelle) sans être une inscription en attente.
    """

    EN_ATTENTE = "en_attente", _("En attente")
    APPROUVE = "approuve", _("Approuvée")
    REFUSE = "refuse", _("Refusée")


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("L'email est obligatoire.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        # Un membre standard doit être activé par RH/Admin après inscription (FDD §3.1)
        extra_fields.setdefault("is_active", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", Role.SUPER_ADMIN)
        # Un superuser n'est pas une inscription libre-service à valider.
        extra_fields.setdefault("registration_decision", RegistrationDecision.APPROUVE)
        extra_fields.setdefault("email_verifie", True)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Un superuser doit avoir is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Un superuser doit avoir is_superuser=True.")

        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Utilisateur CID. L'email est l'identifiant de connexion.
    Les données personnelles étendues (CIN, passeport, adresses) vivent dans
    apps.membres.Membre (relation 1-to-1), pas ici — voir SDD §3.1.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    email = models.EmailField(_("email"), unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBRE)

    is_active = models.BooleanField(
        default=False,
        help_text=_("Un membre inscrit doit être activé par RH ou Admin (FDD §3.1)."),
    )
    is_staff = models.BooleanField(default=False)

    # --- Validation des inscriptions libre-service par RH/Admin (AHM-48) ---
    registration_decision = models.CharField(
        max_length=20,
        choices=RegistrationDecision.choices,
        default=RegistrationDecision.EN_ATTENTE,
        help_text=_(
            "Décision RH/Admin sur cette inscription — distinct de is_active "
            "qui peut aussi être False pour d'autres raisons."
        ),
    )

    # Date de la décision (point 5/6, 2026-10-06 : "Datumsfeld zum Protokollieren") —
    # renseignée à l'approbation (automatique à la confirmation de l'email depuis le
    # 2026-10-05, ou manuelle) ou au refus. Historique consultable dans "Registrierungen".
    registration_decided_at = models.DateTimeField(null=True, blank=True)

    # --- Vérification de l'email à l'inscription (AHM-50) — distinct de la
    # décision RH : un email non confirmé n'est même pas montré à RH. ---
    email_verifie = models.BooleanField(
        default=False,
        help_text=_(
            "Code à 6 chiffres confirmé après inscription. Un superuser ou un "
            "compte créé par import (create_user hors self-registration) n'a "
            "pas besoin de ce garde-fou — voir UserManager."
        ),
    )

    # --- Préférence linguistique persistante (FDD §3.1) ---
    langue_preferee = models.CharField(
        max_length=2,
        choices=[("fr", "Français"), ("de", "Deutsch"), ("ar", "العربية")],
        default="fr",
    )

    # --- Sécurité / 2FA conditionnel (SCD §3.3) ---
    require_2fa = models.BooleanField(
        default=False, help_text=_("Force le 2FA même pour un Membre Normal.")
    )
    last_known_ip = models.GenericIPAddressField(null=True, blank=True)
    trusted_device_token = models.CharField(max_length=64, null=True, blank=True)
    last_successful_login = models.DateTimeField(null=True, blank=True)

    # --- Champ chiffré exemple : secret TOTP de secours (les backup codes
    # sont gérés par django_otp ; ce champ sert à d'éventuels usages futurs) ---
    notes_securite = EncryptedCharField(max_length=500, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        verbose_name = _("Utilisateur")
        verbose_name_plural = _("Utilisateurs")

    def __str__(self):
        return f"{self.email} ({self.get_role_display()})"

    @property
    def role_level(self) -> int:
        return ROLE_LEVELS.get(self.role, 0)

    @property
    def two_fa_mandatory(self) -> bool:
        """2FA obligatoire pour rôles >= Bureau Admin, ou si forcé sur ce compte."""
        return self.role_level >= ROLE_2FA_MANDATORY_MIN_LEVEL or self.require_2fa

    def mark_login(self, ip: str):
        self.last_known_ip = ip
        self.last_successful_login = timezone.now()
        self.save(update_fields=["last_known_ip", "last_successful_login"])


class AuditLogEntry(models.Model):
    """
    Piste d'audit générique (SCD §8.1) : connexions, changements de rôle,
    accès aux données sensibles, imports. Ne contient JAMAIS de données
    personnelles sensibles en clair — uniquement des identifiants.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_entries"
    )
    action = models.CharField(max_length=100)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_log_entries"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["action", "created_at"])]

    def __str__(self):
        return f"{self.action} — {self.user_id} — {self.created_at:%Y-%m-%d %H:%M}"


class DeviceSession(models.Model):
    """
    Associe un refresh token émis (OutstandingToken, app
    rest_framework_simplejwt.token_blacklist déjà utilisée pour le logout —
    voir views.LogoutView) à l'empreinte de l'appareil qui l'a demandé.

    Sert une seule chose : à la connexion, retrouver et révoquer les
    sessions encore actives d'un utilisateur sur CE MÊME appareil (retour
    utilisateur du 2026-09-24 — "wenn ein Benutzer sich einloggt und eine
    Session auf einem Gerät aufmacht, müssen alle laufende Sessions im
    selben Gerät beendet werden"). Un même utilisateur connecté depuis
    plusieurs appareils différents (téléphone + ordinateur) n'est PAS
    affecté — seul un doublon sur le même appareil (onglet oublié,
    reconnexion) l'est. Voir services.enforce_single_session_per_device /
    services.track_device_session, appelés depuis views._issue_tokens.

    L'empreinte est fournie par le frontend (`device_fingerprint`, déjà
    utilisé pour la détection "nouvel appareil" du 2FA conditionnel, SCD
    §3.3 — voir services.requires_2fa) et n'est jamais stockée en clair,
    seul son hash SHA-256 (services.fingerprint_hash) l'est, comme pour
    User.trusted_device_token.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="device_sessions")
    outstanding_token = models.OneToOneField(
        "token_blacklist.OutstandingToken",
        on_delete=models.CASCADE,
        related_name="device_session",
    )
    device_fingerprint_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "device_sessions"
        indexes = [models.Index(fields=["user", "device_fingerprint_hash"])]

    def __str__(self):
        return f"DeviceSession({self.user_id}, {self.device_fingerprint_hash[:8]}…)"


class EmailOTP(models.Model):
    """
    OTP 6 chiffres envoyé par email — méthode de secours 2FA (SCD §3.2).
    Le code lui-même n'est pas stocké en clair : on stocke son hash.
    TTL et anti-spam gérés via les champs expires_at / created_at.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="email_otps")
    code_hash = models.CharField(max_length=128)
    purpose = models.CharField(
        max_length=20,
        choices=[
            ("login_2fa", "Connexion 2FA"),
            ("password_reset", "Réinitialisation MDP"),
            ("email_verification", "Vérification email inscription"),
        ],
        default="login_2fa",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "email_otps"
        indexes = [models.Index(fields=["user", "purpose", "consumed_at"])]

    @property
    def is_valid(self) -> bool:
        return self.consumed_at is None and timezone.now() < self.expires_at

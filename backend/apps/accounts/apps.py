from django.apps import AppConfig


class AccountsConfig(AppConfig):
    """R1 P0 — User model 5 rôles, 2FA TOTP+email, JWT rotation, RBAC (FDD §2, §3.1)."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"
    verbose_name = "Comptes & Authentification"

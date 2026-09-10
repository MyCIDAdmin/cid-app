from django.apps import AppConfig


class MembresConfig(AppConfig):
    """
    R1 P0 — CRUD membres, 5 rôles RBAC, chiffrement CIN/passeport AES-256, import Excel (FDD
    §3.1, RICEFW C-001/W-008).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.membres"
    verbose_name = "Membres"

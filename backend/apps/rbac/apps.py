from django.apps import AppConfig


class RbacConfig(AppConfig):
    """
    Matrice d'accès Rôles × Modules + visibilité de menu pour le rôle Membre Normal (demande
    utilisateur du 2026-09-23 : "Rollenverwaltung [...] Zugriff [...] Modul Verwaltung" — voir
    models.py pour le détail complet).

    Dépend de apps.accounts (User, ROLE_LEVELS, log_audit_event) — jamais l'inverse : les 5 rôles
    système existants et leurs permissions.py bespoke par app métier restent la source de vérité
    inchangée pour tout ce qu'ils géraient déjà (2FA obligatoire, IsRHOrAbove, etc.). Ce module
    n'ajoute qu'une porte SUPPLÉMENTAIRE, jamais un remplacement.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.rbac"
    verbose_name = "Accès (rôles & modules)"

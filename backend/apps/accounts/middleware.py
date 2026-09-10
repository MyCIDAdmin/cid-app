"""
Middleware d'audit léger (SCD §8.1). Complète les logs applicatifs plus
détaillés créés explicitement dans les vues sensibles (connexion, 2FA,
changement de rôle) via apps.accounts.services.log_audit_event.
"""

import logging

logger = logging.getLogger("apps.accounts.audit")


class AuditLogMiddleware:
    """
    Point d'extension pour la corrélation requête/utilisateur dans les logs.
    Ne journalise aucune donnée sensible (SCD §8.1) — uniquement méthode,
    chemin, code de statut et identifiant utilisateur le cas échéant.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code >= 500:
            user_id = getattr(getattr(request, "user", None), "id", None)
            logger.error(
                "5xx %s %s user=%s status=%s",
                request.method,
                request.path,
                user_id,
                response.status_code,
            )
        return response

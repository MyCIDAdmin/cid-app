"""Sperren durch django-axes (zu viele Fehlversuche) ins Protokoll übernehmen."""

from axes.signals import user_locked_out
from django.dispatch import receiver

from apps.accounts.services import log_audit_event, maskiere_email


@receiver(user_locked_out)
def _gesperrt(sender, request=None, username=None, ip_address=None, **kwargs):
    log_audit_event(
        "login_locked_out",
        ip_address=ip_address or None,
        user_agent=(request.META.get("HTTP_USER_AGENT", "") if request is not None else ""),
        email_masked=maskiere_email(username or ""),
    )

"""Sperren durch django-axes (zu viele Fehlversuche) ins Protokoll übernehmen."""

import logging

from axes.signals import user_locked_out
from celery.signals import task_failure
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


@receiver(task_failure)
def _task_fehler(sender=None, exception=None, **kwargs):
    """Fehlgeschlagene Hintergrundjobs (Celery) ins Protokoll — nur Jobname und Fehlerart."""
    try:
        log_audit_event(
            "task_fehlgeschlagen",
            task=getattr(sender, "name", "?"),
            fehler=type(exception).__name__ if exception is not None else "?",
        )
    except Exception:  # pragma: no cover — der Job-Fehler selbst darf nicht überdeckt werden
        logging.getLogger("apps.aktivitaet").exception("task_failure nicht protokolliert")

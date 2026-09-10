"""
Tâches Celery — app accounts.
W-009 (nettoyage tokens JWT expirés) et W-010 (alerte connexion inconnue)
du RICEFW, plus l'envoi asynchrone des emails 2FA / bienvenue.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def send_otp_email(user_id, code):
    """Envoie le code OTP par email (jamais loggé en clair — SCD §8.1)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    send_mail(
        subject="Votre code de connexion CID",
        message=(
            f"Votre code de vérification est : {code}\n\n"
            f"Ce code expire dans {settings.OTP_EMAIL_TTL_MIN} minutes.\n"
            "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


@shared_task
def send_welcome_email(user_id):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    send_mail(
        subject="Bienvenue sur la plateforme CID",
        message=(
            "Votre inscription a bien été enregistrée. Un membre du bureau "
            "ou des RH doit valider votre compte avant que vous puissiez "
            "vous connecter."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


@shared_task
def send_new_ip_alert_email(user_id, ip_address):
    """W-010 — alerte connexion depuis IP/device inconnu."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    send_mail(
        subject="Nouvelle connexion détectée sur votre compte CID",
        message=(
            f"Une connexion depuis une adresse IP inhabituelle ({ip_address}) a été "
            "détectée sur votre compte. Si ce n'était pas vous, changez votre mot "
            "de passe immédiatement."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


@shared_task
def cleanup_expired_tokens():
    """
    W-009 — nettoyage nocturne (Celery Beat, 02h00) des tokens JWT
    blacklistés expirés et des OTP email résiduels.
    """
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    from .models import EmailOTP

    now = timezone.now()
    expired_outstanding = OutstandingToken.objects.filter(expires_at__lt=now)
    count_blacklisted = BlacklistedToken.objects.filter(token__in=expired_outstanding).count()
    expired_outstanding.delete()

    count_otp = EmailOTP.objects.filter(expires_at__lt=now).count()
    EmailOTP.objects.filter(expires_at__lt=now).delete()

    logger.info(
        "cleanup_expired_tokens: %s tokens blacklistés, %s OTP purgés",
        count_blacklisted,
        count_otp,
    )

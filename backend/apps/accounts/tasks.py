"""
Tâches Celery — app accounts.
W-009 (nettoyage tokens JWT expirés) et W-010 (alerte connexion inconnue)
du RICEFW, plus l'envoi asynchrone des emails 2FA / bienvenue.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def _zweisprachig(user, de, fr, *, lien="", cta=("", "")):
    """E-Mail im CID-Layout (Release 31) : Deutsch als Hauptsprache, darunter Französisch.
    `de`/`fr` = (Betreff, Titel, [Absätze]) ; `cta` = (Beschriftung DE, FR) für den Knopf zu `lien`.
    Fehler beim Versand werden wie bisher nicht verschluckt."""
    from apps.notifications.email_cid import Texte, envoyer_email_cid

    textes = {
        "de": Texte(titre=de[1], paragraphes=de[2], cta=cta[0]),
        "fr": Texte(titre=fr[1], paragraphes=fr[2], cta=cta[1]),
    }
    envoyer_email_cid(
        sujet=f"{de[0]} · {fr[0]}",
        destinataire=user.email,
        textes=textes,
        lien=lien,
    )


@shared_task
def send_otp_email(user_id, code):
    """Envoie le code OTP par email (jamais loggé en clair — SCD §8.1)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    minuten = settings.OTP_EMAIL_TTL_MIN
    _zweisprachig(
        user,
        (
            "Dein Anmeldecode für CID",
            "Dein Anmeldecode",
            [
                f"Dein Bestätigungscode lautet: {code}",
                f"Der Code ist {minuten} Minuten gültig.",
                "Wenn du das nicht angefordert hast, ignoriere diese E-Mail.",
            ],
        ),
        (
            "Votre code de connexion CID",
            "Votre code de connexion",
            [
                f"Votre code de vérification est : {code}",
                f"Ce code expire dans {minuten} minutes.",
                "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
            ],
        ),
    )


@shared_task
def send_email_verification_code(user_id, code):
    """AHM-50 — code à 6 chiffres à confirmer juste après l'inscription."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    minuten = settings.OTP_EMAIL_TTL_MIN
    _zweisprachig(
        user,
        (
            "E-Mail-Adresse bestätigen — CID",
            "Bitte bestätige deine E-Mail-Adresse",
            [
                f"Dein Bestätigungscode lautet: {code}",
                f"Der Code ist {minuten} Minuten gültig.",
                "Gib ihn auf der Registrierungsseite ein, um deine Anmeldung abzuschließen.",
            ],
        ),
        (
            "Confirmez votre email — CID",
            "Veuillez confirmer votre adresse e-mail",
            [
                f"Votre code de confirmation est : {code}",
                f"Ce code expire dans {minuten} minutes.",
                "Saisissez-le sur la page d'inscription pour finaliser votre demande.",
            ],
        ),
    )


@shared_task
def send_welcome_email(user_id):
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    _zweisprachig(
        user,
        (
            "Willkommen bei CID",
            "Willkommen bei CID",
            [
                "Deine Registrierung ist eingegangen und dein Konto ist aktiv: Du kannst dich "
                "sofort anmelden. Um alle Vorteile für Mitglieder zu nutzen, beantrage deine "
                "Mitgliedschaft unter „Meine Mitgliedschaft“.",
            ],
        ),
        (
            "Bienvenue sur la plateforme CID",
            "Bienvenue sur la plateforme CID",
            [
                "Votre inscription a bien été enregistrée et votre compte est actif : vous "
                "pouvez vous connecter dès maintenant. Pour profiter de tous les avantages "
                "membres, demandez votre adhésion dans « Mon adhésion ».",
            ],
        ),
        lien="/login",
        cta=("Zur Anmeldung", "Se connecter"),
    )


@shared_task
def notifier_nouvelle_inscription_rh(user_id):
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") —
    déclenchée par `RegisterConfirmView.post` juste après confirmation de l'email (AHM-50),
    au moment précis où l'inscription devient visible par RH sur `/inscriptions` (voir
    `PendingRegistrationsView.get_queryset`, filtrée sur `email_verifie=True`). Diffusée à
    tout RH+, sans email (file d'attente partagée, pas de destinataire individuel) — même
    principe que `apps.adhesions.notifications.notifier_nouveau_justificatif_staff`."""
    from django.contrib.auth import get_user_model

    from apps.accounts.services import users_role_at_least
    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    from .models import ROLE_LEVELS, Role

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    membre = getattr(user, "membre", None)
    nom = f"{membre.prenom} {membre.nom}".strip() if membre else user.email
    for destinataire in users_role_at_least(ROLE_LEVELS[Role.RH]):
        notifier(
            destinataire,
            TypeNotification.ACCOUNTS_NOUVELLE_INSCRIPTION,
            titre="Nouvelle inscription à valider",
            message=f"{nom} a confirmé son inscription et attend une décision.",
            lien="/inscriptions",
        )


@shared_task
def send_password_reset_email(user_id, token):
    """FDD §3.1 — lien de réinitialisation, valide 1h (services.PASSWORD_RESET_MAX_AGE_SECONDS)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    _zweisprachig(
        user,
        (
            "Passwort zurücksetzen — CID",
            "Passwort zurücksetzen",
            [
                "Du hast das Zurücksetzen deines Passworts angefordert.",
                "Der Link ist 1 Stunde gültig und nur einmal verwendbar.",
                "Wenn du das nicht angefordert hast, ignoriere diese E-Mail ; dein aktuelles "
                "Passwort bleibt unverändert.",
            ],
        ),
        (
            "Réinitialisation de votre mot de passe CID",
            "Réinitialisation du mot de passe",
            [
                "Vous avez demandé la réinitialisation de votre mot de passe.",
                "Le lien est valable 1 heure et à usage unique.",
                "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email — votre "
                "mot de passe actuel reste inchangé.",
            ],
        ),
        lien=f"/reset-password?token={token}",
        cta=("Neues Passwort festlegen", "Choisir un nouveau mot de passe"),
    )


@shared_task
def send_registration_approved_email(user_id):
    """
    AHM-48 — le compte vient d'être activé par RH/Admin.

    C'est aussi le point d'intégration du type "bienvenue" (Phase 2B, CID-RPL-001 §2.2, 1 des 11
    types R1) : créer la notification in-app dès l'inscription (send_welcome_email) n'aurait pas
    de sens, le compte n'étant pas encore actif — l'utilisateur ne peut pas se connecter pour la
    voir. C'est ici, quand le compte devient utilisable, que "bienvenue" s'applique réellement.
    """
    from django.contrib.auth import get_user_model

    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    _zweisprachig(
        user,
        (
            "Dein CID-Konto wurde freigeschaltet",
            "Konto freigeschaltet",
            [
                "Gute Nachrichten: Deine Registrierung wurde vom Büro bzw. der Personal"
                "verwaltung bestätigt. Du kannst dich jetzt bei der CID-Plattform anmelden.",
            ],
        ),
        (
            "Votre compte CID a été activé",
            "Compte activé",
            [
                "Bonne nouvelle : votre inscription a été validée par un membre du bureau ou "
                "des RH. Vous pouvez désormais vous connecter à la plateforme CID.",
            ],
        ),
        lien="/login",
        cta=("Zur Anmeldung", "Se connecter"),
    )
    notifier(
        user,
        TypeNotification.BIENVENUE,
        titre="Bienvenue sur CID" if user.langue_preferee == "fr" else "Willkommen bei CID",
        message=(
            "Votre compte a été activé, vous pouvez désormais vous connecter."
            if user.langue_preferee == "fr"
            else "Dein Konto wurde freigeschaltet, du kannst dich jetzt anmelden."
        ),
        lien="/dashboard",
    )


@shared_task
def send_registration_refused_email(user_id):
    """AHM-48 — l'inscription a été refusée par RH/Admin."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return

    _zweisprachig(
        user,
        (
            "Deine CID-Registrierung wurde nicht bestätigt",
            "Registrierung nicht bestätigt",
            [
                "Deine Registrierung bei der CID-Plattform wurde vom Büro bzw. der Personal"
                "verwaltung nicht bestätigt. Wenn du glaubst, dass es sich um einen Irrtum "
                "handelt, wende dich bitte an den Verein.",
            ],
        ),
        (
            "Votre inscription CID n'a pas été validée",
            "Inscription non validée",
            [
                "Votre demande d'inscription à la plateforme CID n'a pas été validée par le "
                "bureau ou les RH. Si vous pensez qu'il s'agit d'une erreur, contactez "
                "l'association.",
            ],
        ),
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

    _zweisprachig(
        user,
        (
            "Neue Anmeldung auf deinem CID-Konto",
            "Neue Anmeldung erkannt",
            [
                f"Es wurde eine Anmeldung von einer ungewöhnlichen IP-Adresse ({ip_address}) "
                "festgestellt. Warst du das nicht, ändere sofort dein Passwort.",
            ],
        ),
        (
            "Nouvelle connexion détectée sur votre compte CID",
            "Nouvelle connexion détectée",
            [
                f"Une connexion depuis une adresse IP inhabituelle ({ip_address}) a été détectée "
                "sur votre compte. Si ce n'était pas vous, changez votre mot de passe "
                "immédiatement.",
            ],
        ),
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

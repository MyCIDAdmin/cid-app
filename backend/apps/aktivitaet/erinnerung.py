"""Erinnerung an die Authenticator-App (Cockpit der Seite „Aktivität“).

Konten mit erweiterten Rechten (ab Bureau Admin oder eigene Rolle) sollen die Anmeldung mit
Authenticator-App nutzen. Der App-Admin kann allen betroffenen Konten oder einem einzelnen eine
E-Mail schicken. Dieselbe Person bekommt höchstens eine Erinnerung je 24 Stunden. Die E-Mail
enthält nur den Hinweis und den Link zum eigenen Profil ; die Mail-Einstellung des Moduls
„Aktivität“ gilt auch hier.
"""

from datetime import timedelta

from django.utils import timezone
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.accounts.models import AuditLogEntry
from apps.accounts.services import log_audit_event
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.services import email_module_actif

from .review import privilegierte_konten

LINK = "/mon-profil"
SPERRE = timedelta(hours=24)


def betroffene(user_id=None):
    """Konten mit erweiterten Rechten ohne bestätigte Authenticator-App (mit E-Mail-Adresse)."""
    konten = privilegierte_konten().exclude(email="")
    mit = TOTPDevice.objects.filter(confirmed=True).values("user_id")
    konten = konten.exclude(pk__in=mit)
    if user_id:
        konten = konten.filter(pk=user_id)
    return list(konten)


def senden(admin, user_id=None, ip=None) -> dict:
    """Erinnerungen versenden ; gibt die Zahlen für die Rückmeldung in der Oberfläche zurück."""
    konten = betroffene(user_id)
    if not email_module_actif("aktivitaet"):
        return {"gesendet": 0, "uebersprungen": len(konten), "mail_aus": True}
    seit = timezone.now() - SPERRE
    kuerzlich = {
        str(m)
        for m in AuditLogEntry.objects.filter(
            action="totp_erinnerung", created_at__gte=seit
        ).values_list("metadata__ziel", flat=True)
    }
    gesendet = 0
    for u in konten:
        if str(u.pk) in kuerzlich:
            continue
        textes = {
            "de": Texte(
                titre="Bitte die Authenticator-App einrichten",
                paragraphes=[
                    "Dein Konto hat erweiterte Rechte. Dafür ist die Anmeldung mit "
                    "Authenticator-App vorgesehen.",
                    "Du richtest sie in deinem Profil unter „Einstellungen“ ein. "
                    "Das dauert etwa zwei Minuten.",
                ],
                cta="Mein Profil öffnen",
            ),
            "fr": Texte(
                titre="Merci de configurer l'application d'authentification",
                paragraphes=[
                    "Votre compte dispose de droits étendus. La connexion avec une application "
                    "d'authentification est prévue pour ces comptes.",
                    "Vous la configurez dans votre profil, sous « Paramètres ». "
                    "Cela prend environ deux minutes.",
                ],
                cta="Ouvrir mon profil",
            ),
        }
        envoyer_email_cid(
            sujet="[CID] Authenticator-App einrichten",
            destinataire=u.email,
            textes=textes,
            lien=LINK,
            fail_silently=True,
        )
        log_audit_event("totp_erinnerung", user=admin, ip_address=ip, ziel=str(u.pk))
        gesendet += 1
    return {"gesendet": gesendet, "uebersprungen": len(konten) - gesendet, "mail_aus": False}

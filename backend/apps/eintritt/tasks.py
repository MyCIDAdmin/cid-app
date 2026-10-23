"""Versand des Tickets : Mail mit PDF, In-App-Hinweis und — falls im Profil verbunden und die Art
„Veranstaltungen“ gewählt ist — Telegram mit dem PDF (ohne Namen).

Das PDF ist die Offline-Fassung für den Einlass. Der Versand ist idempotent (`versendet_am`),
Fehler eines Kanals stören die anderen nicht.
"""

import logging

from celery import shared_task
from django.utils import timezone

from apps.kalender.benachrichtigung import sprache
from apps.notifications import telegram
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TelegramVerknuepfung, TypeNotification
from apps.notifications.services import notifier

from . import pdf, services
from .models import Eintrittsticket

logger = logging.getLogger(__name__)

TELEGRAM_ART = "veranstaltungen"


def _texte(daten: dict) -> dict[str, Texte]:
    personen_de, personen_fr = pdf.personen_text(daten["erwachsene"], daten["kinder"])
    termin = pdf.datum_text(daten["datum"], daten["uhrzeit"])
    titel = daten["titel"]
    return {
        "de": Texte(
            titre="Dein Eintrittsticket",
            paragraphes=[
                f"Im Anhang findest du dein Ticket für „{titel}“ als PDF. Speichere es auf dem "
                "Handy, dann hast du es am Einlass auch ohne Netz dabei.",
                "Zeige am Einlass den QR-Code vor. Kommt nur ein Teil deiner Gruppe, kann der "
                "Rest später mit demselben Ticket eintreten.",
            ],
            details=[
                ("Veranstaltung", titel),
                ("Termin", termin),
                ("Ort", daten["ort"]),
                ("Personen", personen_de),
            ],
            cta="Ticket in der App öffnen",
        ),
        "fr": Texte(
            titre="Votre billet d’entrée",
            paragraphes=[
                f"Vous trouverez en pièce jointe votre billet pour « {titel} » au format PDF. "
                "Enregistrez-le sur votre téléphone pour l’avoir à l’entrée, même sans réseau.",
                "Présentez le code QR à l’entrée. Si une partie de votre groupe arrive plus tard, "
                "elle entre avec le même billet.",
            ],
            details=[
                ("Événement", titel),
                ("Date", termin),
                ("Lieu", daten["ort"]),
                ("Personnes", personen_fr),
            ],
            cta="Ouvrir le billet dans l’application",
        ),
        "ar": Texte(
            titre="تذكرة الدخول الخاصة بك",
            paragraphes=[
                f"تجد في المرفق تذكرتك لـ «{titel}» بصيغة PDF. احفظها على هاتفك لتكون معك عند "
                "المدخل حتى دون اتصال بالإنترنت."
            ],
            details=[("الموعد", termin), ("المكان", daten["ort"])],
            cta="فتح التذكرة في التطبيق",
        ),
    }


def _mail(user, ticket, daten) -> bool:
    if not getattr(user, "email", ""):
        return False
    anhang = (pdf.dateiname(ticket), pdf.ticket_pdf(ticket, mit_name=True), "application/pdf")
    gesendet = envoyer_email_cid(
        sujet=f"Dein Ticket: {daten['titel']} · Votre billet : {daten['titel']}",
        destinataire=user.email,
        textes=_texte(daten),
        lien=daten["lien"],
        fail_silently=True,
        anhaenge=[anhang],
    )
    return bool(gesendet)


def _telegram(user, ticket, daten) -> bool:
    if not telegram.bot_konfiguriert():
        return False
    verknuepfung = TelegramVerknuepfung.objects.filter(user=user, chat_id__isnull=False).first()
    if verknuepfung is None or TELEGRAM_ART not in verknuepfung.kategorien:
        return False
    fr = telegram.sprache_von(user) == "fr"
    termin = pdf.datum_text(daten["datum"], daten["uhrzeit"])
    beschriftung = (
        f"Billet d’entrée : {daten['titel']}\n{termin}"
        if fr
        else f"Eintrittsticket: {daten['titel']}\n{termin}"
    )
    try:
        telegram.sende_dokument(
            verknuepfung.chat_id,
            pdf.ticket_pdf(ticket, mit_name=False),
            pdf.dateiname(ticket),
            beschriftung,
        )
    except telegram.TelegramGesperrt:
        telegram.trenne(verknuepfung)
        return False
    except Exception:  # Telegram darf den Versand der anderen Kanäle nie stören
        logger.warning("Ticket per Telegram nicht gesendet", exc_info=True)
        return False
    return True


@shared_task
def ticket_senden(ticket_id, erneut: bool = False) -> int:
    """Schickt das Ticket an die Person. Gibt die Zahl der erreichten Kanäle (Mail, Telegram)
    zurück ; ohne `erneut` nur einmal je Ticket/Code."""
    ticket = (
        Eintrittsticket.objects.select_related(
            "inscription__evenement",
            "inscription__membre__user",
            "teilnahme__veranstaltung",
            "teilnahme__user",
        )
        .filter(pk=ticket_id)
        .first()
    )
    if ticket is None or not ticket.gueltig:
        return 0
    if ticket.versendet_am is not None and not erneut:
        return 0
    user = services.inhaber(ticket)
    if user is None or not user.is_active:
        return 0
    daten = services.anzeige(ticket)

    kanaele = int(_mail(user, ticket, daten)) + int(_telegram(user, ticket, daten))

    de = sprache(user) == "de"
    notifier(
        user,
        TypeNotification.TICKET_BEREIT,
        titre=("Dein Eintrittsticket ist bereit" if de else "Votre billet d’entrée est prêt"),
        message=(
            f"Ticket für „{daten['titel']}“ — auch als PDF per Mail."
            if de
            else f"Billet pour « {daten['titel']} » — aussi en PDF par e-mail."
        ),
        lien=daten["lien"],
    )
    ticket.versendet_am = timezone.now()
    ticket.save(update_fields=["versendet_am", "updated_at"])
    return kanaele

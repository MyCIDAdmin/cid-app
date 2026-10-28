"""
Telegram-Anbindung (Release 32) : Benachrichtigungen zusätzlich in einen privaten Chat.

Datensparsamkeit : gesendet wird nur der Titel der Benachrichtigung plus Link in die App, nie
der Inhalt (`message`). Gespeichert wird nur die Chat-ID. Ohne `TELEGRAM_BOT_TOKEN` tut dieses
Modul nichts.
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

import requests
from django.conf import settings
from django.utils import timezone

from .models import TelegramVerknuepfung, TypeNotification

logger = logging.getLogger(__name__)

CODE_MINUTEN = 15
API = "https://api.telegram.org"

T = TypeNotification
# Benachrichtigungsarten, die einzeln ein- und ausgeschaltet werden (Reihenfolge = Anzeige).
KATEGORIEN: dict[str, set[str]] = {
    "regionen": {T.REGION_VERANSTALTUNG},
    "reisen": {
        T.REISE_EINLADUNG,
        T.REISE_ANFRAGE,
        T.REISE_ENTSCHEIDUNG,
        T.REISE_FRIST,
        T.REISE_INFO,
        T.REISE_AUFGABE,
    },
    "support": {T.SUPPORT_TICKET_NEU, T.SUPPORT_ANTWORT, T.SUPPORT_STATUS},
    "veranstaltungen": {
        T.EVENEMENT_INVITATION,
        T.EVENEMENT_RAPPEL,
        T.EVENEMENT_ANNULE,
        T.TICKET_BEREIT,
    },
    "kalender": {
        T.KALENDER_EINLADUNG,
        T.KALENDER_VORSCHLAG,
        T.KALENDER_AENDERUNG,
        T.KALENDER_ANTWORT,
        T.KALENDER_DIENST,
        T.KALENDER_UMFRAGE,
        T.KALENDER_SITZUNG,
    },
    "nachrichten": {
        T.MESSAGE_PRIVE_RECU,
        T.COMMUNAUTE_REPONSE_FORUM,
        T.COMMUNAUTE_MESSAGE_GROUPE,
        T.COMMUNAUTE_COMMENTAIRE_FIL,
        T.COMMUNAUTE_MENTION,
        T.COMMUNAUTE_PUBLICATION_IMPORTANTE,
    },
    "projekte": {
        T.PROJEKT_AUFGABE_ZUGEWIESEN,
        T.PROJEKT_AUFGABE_KOMMENTAR,
        T.PROJEKT_AUFGABE_FAELLIG,
        T.PROJEKT_BEWERBUNG,
        T.PROJEKT_BEWERBUNG_ENTSCHIEDEN,
    },
    "mitgliedschaft": {
        T.BIENVENUE,
        T.PAIEMENT_CONFIRME,
        T.RELANCE_COTISATION,
        T.ADHESION_CAMPAGNE_PUBLIEE,
        T.ADHESION_JUSTIFICATIF_VALIDE,
        T.ADHESION_JUSTIFICATIF_REFUSE,
        T.ADHESION_SOUSCRIPTION_ANNULEE,
        T.FAMILIE_EINLADUNG,
        T.FAMILIE_ANTWORT,
        T.FAMILIE_ALTER,
        T.AKTION_FRIST,
        T.AKTION_ZIEL,
        T.MEMBRE_STATUT_ACTIF,
        T.MEMBRE_STATUT_INACTIF,
        T.VOTE_OUVERTURE,
        T.VOTE_RESULTATS,
    },
    "shop": {
        T.BOUTIQUE_COMMANDE_CONFIRMEE,
        T.BOUTIQUE_COMMANDE_EXPEDIEE,
        T.BOUTIQUE_COMMANDE_ANNULEE,
        T.BOUTIQUE_BON_ACHAT_ACTIF,
    },
    "verwaltung": {
        T.ADHESION_JUSTIFICATIF_SOUMIS,
        T.ACCOUNTS_NOUVELLE_INSCRIPTION,
        T.COTISATION_PAIEMENT_ATTENTE,
        T.BOUTIQUE_NOUVELLE_COMMANDE,
        T.PARTNER_VERTRAGSENDE,
        T.PARTNER_BEWERTUNG,
        T.AKTIVITAET_AUFFAELLIGKEIT,
        T.AKTIVITAET_BERICHT,
        T.AKTIVITAET_REVIEW,
    },
}
SONSTIGES = "sonstiges"
ALLE_KATEGORIEN = [*KATEGORIEN, SONSTIGES]


def kategorie_von(typ: str) -> str:
    for name, typen in KATEGORIEN.items():
        if typ in typen:
            return name
    return SONSTIGES


class TelegramGesperrt(Exception):
    """Die Person hat den Bot blockiert oder den Chat gelöscht (HTTP 403)."""


def bot_konfiguriert() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def _aufruf(methode: str, **daten) -> dict:
    antwort = requests.post(
        f"{API}/bot{settings.TELEGRAM_BOT_TOKEN}/{methode}", json=daten, timeout=10
    )
    if antwort.status_code == 403:
        raise TelegramGesperrt()
    antwort.raise_for_status()
    return antwort.json()


def sende_text(chat_id: int, text: str) -> None:
    _aufruf("sendMessage", chat_id=chat_id, text=text, disable_web_page_preview=True)


def sende_dokument(chat_id: int, inhalt: bytes, dateiname: str, beschriftung: str = "") -> None:
    """Schickt eine Datei (z. B. das Eintrittsticket als PDF) in den Chat."""
    antwort = requests.post(
        f"{API}/bot{settings.TELEGRAM_BOT_TOKEN}/sendDocument",
        data={"chat_id": chat_id, "caption": beschriftung[:1000]},
        files={"document": (dateiname, inhalt, "application/pdf")},
        timeout=20,
    )
    if antwort.status_code == 403:
        raise TelegramGesperrt()
    antwort.raise_for_status()


def setze_webhook(url: str) -> dict:
    daten = {"url": url, "allowed_updates": ["message"]}
    if settings.TELEGRAM_WEBHOOK_SECRET:
        daten["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET
    return _aufruf("setWebhook", **daten)


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def verknuepfung_von(user) -> TelegramVerknuepfung:
    obj, neu = TelegramVerknuepfung.objects.get_or_create(
        user=user, defaults={"kategorien": list(ALLE_KATEGORIEN)}
    )
    return obj


def neuer_code(user) -> tuple[str, "timezone.datetime"]:
    """Erzeugt einen einmaligen Code (nur der Hash wird gespeichert) für den Link in den Bot."""
    obj = verknuepfung_von(user)
    code = secrets.token_urlsafe(16)
    obj.code_hash = _hash(code)
    obj.code_gueltig_bis = timezone.now() + timedelta(minutes=CODE_MINUTEN)
    obj.save(update_fields=["code_hash", "code_gueltig_bis"])
    return code, obj.code_gueltig_bis


def verknuepfe(code: str, chat_id: int) -> TelegramVerknuepfung | None:
    """Bindet den Chat an das Konto, zu dem der (gültige, unbenutzte) Code gehört."""
    if not code:
        return None
    obj = (
        TelegramVerknuepfung.objects.select_related("user")
        .filter(code_hash=_hash(code), code_gueltig_bis__gt=timezone.now())
        .first()
    )
    if obj is None:
        return None
    # Ein Chat gehört zu höchstens einem Konto.
    TelegramVerknuepfung.objects.filter(chat_id=chat_id).exclude(pk=obj.pk).update(
        chat_id=None, verknuepft_am=None
    )
    obj.chat_id = chat_id
    obj.verknuepft_am = timezone.now()
    obj.code_hash = ""
    obj.code_gueltig_bis = None
    obj.save(update_fields=["chat_id", "verknuepft_am", "code_hash", "code_gueltig_bis"])
    return obj


def trenne(obj: TelegramVerknuepfung) -> None:
    obj.chat_id = None
    obj.verknuepft_am = None
    obj.code_hash = ""
    obj.code_gueltig_bis = None
    obj.save(update_fields=["chat_id", "verknuepft_am", "code_hash", "code_gueltig_bis"])


def sprache_von(user) -> str:
    return "fr" if getattr(user, "langue_preferee", "") == "fr" else "de"


def text_fuer(notification) -> str:
    """Kurztext : Titel und Link, nie der Inhalt der Benachrichtigung."""
    base = settings.FRONTEND_URL.rstrip("/")
    ziel = f"{base}{notification.lien}" if notification.lien else base
    hinweis = (
        "Détails dans l’application :"
        if sprache_von(notification.destinataire) == "fr"
        else "Details in der App:"
    )
    return f"{notification.titre}\n{hinweis} {ziel}"

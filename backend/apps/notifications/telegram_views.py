"""
Telegram-Endpunkte (Release 32).

* /telegram/ (GET, PATCH, DELETE), /telegram/verbinden/, /telegram/test/ : für das eigene Konto.
* /telegram/webhook/ : Eingang für den Bot ; durch den geheimen Schlüssel geschützt, den Telegram
  im Header `X-Telegram-Bot-Api-Secret-Token` mitsendet. Der Bot beantwortet nur `/start <Code>`,
  `/stop` und gibt sonst einen kurzen Hinweis (Platz für einen späteren Support-Bot).
"""

import hmac
import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import telegram

logger = logging.getLogger(__name__)

HILFE = (
    "Ich sende dir Benachrichtigungen aus der CID-App. Verbinden und Einstellungen: "
    "Mein Profil › Einstellungen. /stop trennt die Verbindung.\n\n"
    "Je t’envoie les notifications de l’application CID. Connexion et réglages : "
    "Mon profil › Paramètres. /stop coupe la connexion."
)
VERBUNDEN = (
    "Verbunden. Du bekommst die Benachrichtigungen jetzt auch hier. Auswahl und Trennen: "
    "Mein Profil › Einstellungen.\n\n"
    "Connecté. Tu reçois désormais aussi les notifications ici. Choix et déconnexion : "
    "Mon profil › Paramètres."
)
UNGUELTIG = (
    "Dieser Link ist abgelaufen oder wurde schon benutzt. Bitte in der App einen neuen "
    "erzeugen.\n\n"
    "Ce lien a expiré ou a déjà été utilisé. Génère-en un nouveau dans l’application."
)
GETRENNT = "Getrennt. / Déconnecté."


def _zustand(user) -> dict:
    verknuepfung = telegram.verknuepfung_von(user) if telegram.bot_konfiguriert() else None
    return {
        "aktiv": telegram.bot_konfiguriert(),
        "bot": settings.TELEGRAM_BOT_USERNAME,
        "verbunden": bool(verknuepfung and verknuepfung.verbunden),
        "verknuepft_am": verknuepfung.verknuepft_am if verknuepfung else None,
        "kategorien": verknuepfung.kategorien if verknuepfung else [],
        "verfuegbar": telegram.ALLE_KATEGORIEN,
    }


class TelegramView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_zustand(request.user))

    def patch(self, request):
        if not telegram.bot_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        kategorien = request.data.get("kategorien")
        if not isinstance(kategorien, list) or any(
            k not in telegram.ALLE_KATEGORIEN for k in kategorien
        ):
            return Response(
                {"kategorien": "Ungültige Auswahl."}, status=status.HTTP_400_BAD_REQUEST
            )
        verknuepfung = telegram.verknuepfung_von(request.user)
        verknuepfung.kategorien = [k for k in telegram.ALLE_KATEGORIEN if k in kategorien]
        verknuepfung.save(update_fields=["kategorien"])
        return Response(_zustand(request.user))

    def delete(self, request):
        if not telegram.bot_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        verknuepfung = telegram.verknuepfung_von(request.user)
        chat_id = verknuepfung.chat_id
        telegram.trenne(verknuepfung)
        if chat_id:
            try:
                telegram.sende_text(chat_id, GETRENNT)
            except Exception:  # die Trennung gilt auch, wenn die Abschiedsnachricht scheitert
                logger.info("Telegram-Abschiedsnachricht nicht zugestellt")
        return Response(status=status.HTTP_204_NO_CONTENT)


class TelegramVerbindenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not telegram.bot_konfiguriert() or not settings.TELEGRAM_BOT_USERNAME:
            return Response(status=status.HTTP_503_SERVICE_UNAVAILABLE)
        code, gueltig_bis = telegram.neuer_code(request.user)
        return Response(
            {
                "link": f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={code}",
                "gueltig_bis": gueltig_bis,
            }
        )


class TelegramTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not telegram.bot_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        verknuepfung = telegram.verknuepfung_von(request.user)
        if not verknuepfung.verbunden:
            return Response(status=status.HTTP_409_CONFLICT)
        try:
            telegram.sende_text(
                verknuepfung.chat_id,
                "Testnachricht der CID-App. / Message de test de l’application CID.",
            )
        except telegram.TelegramGesperrt:
            telegram.trenne(verknuepfung)
            return Response(status=status.HTTP_409_CONFLICT)
        except Exception:
            return Response(status=status.HTTP_502_BAD_GATEWAY)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TelegramWebhookView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request):
        geheim = settings.TELEGRAM_WEBHOOK_SECRET
        gesendet = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not telegram.bot_konfiguriert() or not geheim:
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not hmac.compare_digest(gesendet.encode(), geheim.encode()):
            return Response(status=status.HTTP_403_FORBIDDEN)
        try:
            self._verarbeite(request.data)
        except Exception:
            # Telegram würde bei Fehlern denselben Aufruf wiederholen ; immer 200 antworten.
            logger.exception("Telegram-Webhook")
        return Response({})

    @staticmethod
    def _verarbeite(update) -> None:
        nachricht = update.get("message") if isinstance(update, dict) else None
        if not isinstance(nachricht, dict):
            return
        chat = nachricht.get("chat") or {}
        if chat.get("type") != "private" or not isinstance(chat.get("id"), int):
            return
        chat_id = chat["id"]
        text = (nachricht.get("text") or "").strip()
        befehl, _, rest = text.partition(" ")
        befehl = befehl.split("@")[0].lower()
        if befehl == "/start" and rest.strip():
            verknuepfung = telegram.verknuepfe(rest.strip(), chat_id)
            telegram.sende_text(chat_id, VERBUNDEN if verknuepfung else UNGUELTIG)
        elif befehl == "/stop":
            from .models import TelegramVerknuepfung

            for obj in TelegramVerknuepfung.objects.filter(chat_id=chat_id):
                telegram.trenne(obj)
            telegram.sende_text(chat_id, GETRENNT)
        else:
            telegram.sende_text(chat_id, HILFE)

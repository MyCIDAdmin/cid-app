"""API der Eintrittstickets : eigene Tickets anzeigen, erneut senden, erneuern.

Eine Person sieht und ändert nur ihre eigenen Tickets (fremde Tickets → 404). Scannen und
Einlass folgen in einem späteren Schritt.
"""

from datetime import timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.notifications.models import TelegramVerknuepfung

from . import services, tasks
from .models import Eintrittsticket

#: Mindestabstand zwischen zwei Versendungen desselben Tickets (Schutz vor Dauerklicken).
SENDE_PAUSE = timedelta(seconds=60)


def _eigene(user):
    return (
        Eintrittsticket.objects.filter(Q(inscription__membre__user=user) | Q(teilnahme__user=user))
        .select_related(
            "inscription__evenement",
            "inscription__membre",
            "teilnahme__veranstaltung",
            "teilnahme__user",
        )
        .order_by("created_at")
    )


def ticket_dict(ticket: Eintrittsticket) -> dict:
    daten = services.anzeige(ticket)
    return {
        "id": str(ticket.pk),
        "art": daten["art"],
        "titel": daten["titel"],
        "datum": daten["datum"].isoformat(),
        "uhrzeit": daten["uhrzeit"].strftime("%H:%M") if daten["uhrzeit"] else None,
        "ort": daten["ort"],
        "erwachsene": daten["erwachsene"],
        "kinder": daten["kinder"],
        "name": daten["name"],
        "qr": services.qr_data_url(ticket),
        "versendet_am": ticket.versendet_am.isoformat() if ticket.versendet_am else None,
    }


class MeineTicketsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        heute = timezone.localdate()
        tickets = [
            t
            for t in _eigene(request.user).filter(gueltig=True)
            if services.anzeige(t)["datum"] >= heute
        ]
        tickets.sort(key=lambda t: (services.anzeige(t)["datum"], t.created_at))
        telegram_verbunden = TelegramVerknuepfung.objects.filter(
            user=request.user, chat_id__isnull=False
        ).exists()
        return Response(
            {
                "tickets": [ticket_dict(t) for t in tickets],
                "telegram_verbunden": telegram_verbunden,
            }
        )


class TicketSendenView(APIView):
    """Schickt das Ticket erneut per Mail (und Telegram, falls verbunden)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ticket = get_object_or_404(_eigene(request.user).filter(gueltig=True), pk=pk)
        if ticket.versendet_am and timezone.now() - ticket.versendet_am < SENDE_PAUSE:
            return Response(
                {"details": "Das Ticket wurde gerade erst gesendet. Bitte kurz warten."},
                status=429,
            )
        tasks.ticket_senden.delay(str(ticket.pk), True)
        return Response({"gesendet": True})


class TicketErneuernView(APIView):
    """Neuer Code, der alte wird ungültig ; das neue Ticket geht automatisch an die Person."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        ticket = get_object_or_404(_eigene(request.user).filter(gueltig=True), pk=pk)
        ticket = services.erneuern(ticket)
        return Response(ticket_dict(ticket))

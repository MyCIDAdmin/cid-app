"""
Push-Endpunkte (Release 2026.11, Web-Push) — alle für das eigene Konto.

* GET /push/ : Zustand (eingerichtet?, öffentlicher Schlüssel, Geräte, gewählte Arten).
* PATCH /push/ : Arten ändern.
* POST /push/abo/ : dieses Gerät anmelden (Inhalt von `PushSubscription.toJSON()`).
* DELETE /push/abo/ : dieses Gerät abmelden (`{"endpoint": ...}`).
* POST /push/test/ : Testmeldung an alle eigenen Geräte.
"""

import logging

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import push
from .models import PushAbo
from .telegram import ALLE_KATEGORIEN, sprache_von

logger = logging.getLogger(__name__)

TEST_TITEL = {
    "de": "Testmeldung der CID-App: Push funktioniert.",
    "fr": "Message de test de l’application CID : le push fonctionne.",
}


def _zustand(user) -> dict:
    aktiv = push.push_konfiguriert()
    abos = list(PushAbo.objects.filter(user=user)) if aktiv else []
    return {
        "aktiv": aktiv,
        "schluessel": settings.VAPID_PUBLIC_KEY if aktiv else "",
        "geraete": [
            {
                "id": str(a.id),
                "endpoint": a.endpoint,
                "geraet": a.geraet,
                "created_at": a.created_at,
                "zuletzt_zugestellt": a.zuletzt_zugestellt,
            }
            for a in abos
        ],
        "kategorien": push.einstellung_von(user).kategorien if aktiv else [],
        "verfuegbar": ALLE_KATEGORIEN,
    }


class PushView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_zustand(request.user))

    def patch(self, request):
        if not push.push_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        kategorien = request.data.get("kategorien")
        if not isinstance(kategorien, list) or any(k not in ALLE_KATEGORIEN for k in kategorien):
            return Response(
                {"kategorien": "Ungültige Auswahl."}, status=status.HTTP_400_BAD_REQUEST
            )
        einstellung = push.einstellung_von(request.user)
        einstellung.kategorien = [k for k in ALLE_KATEGORIEN if k in kategorien]
        einstellung.save(update_fields=["kategorien"])
        return Response(_zustand(request.user))


class PushAboView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not push.push_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        daten = request.data if isinstance(request.data, dict) else {}
        endpoint = daten.get("endpoint")
        schluessel = daten.get("keys")
        schluessel = schluessel if isinstance(schluessel, dict) else {}
        p256dh = schluessel.get("p256dh")
        auth = schluessel.get("auth")
        if not push.endpoint_erlaubt(endpoint):
            return Response(
                {"endpoint": "Dieser Push-Dienst wird nicht unterstützt."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (
            not isinstance(p256dh, str)
            or not isinstance(auth, str)
            or not 20 <= len(p256dh) <= 255
            or not 8 <= len(auth) <= 64
        ):
            return Response({"keys": "Ungültige Schlüssel."}, status=status.HTTP_400_BAD_REQUEST)
        push.abo_speichern(
            request.user,
            endpoint=endpoint,
            p256dh=p256dh,
            auth=auth,
            user_agent=request.headers.get("User-Agent", ""),
        )
        return Response(_zustand(request.user), status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get("endpoint") if isinstance(request.data, dict) else None
        if not isinstance(endpoint, str):
            return Response(status=status.HTTP_400_BAD_REQUEST)
        PushAbo.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PushTestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not push.push_konfiguriert():
            return Response(status=status.HTTP_404_NOT_FOUND)
        if not PushAbo.objects.filter(user=request.user).exists():
            return Response(status=status.HTTP_409_CONFLICT)
        sprache = sprache_von(request.user)
        zugestellt = push.sende_an_konto(
            request.user,
            {"titel": TEST_TITEL[sprache], "link": "/", "tag": "test", "sprache": sprache},
        )
        if zugestellt == 0:
            return Response(status=status.HTTP_502_BAD_GATEWAY)
        return Response(status=status.HTTP_204_NO_CONTENT)

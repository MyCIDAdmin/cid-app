"""Öffentliche Vorschau einer Reise (ohne Anmeldung). Nur Reisen mit Sichtbarkeit „Alle Mitglieder“
oder „Alle mit Konto“, bei denen die Organisation die Vorschau eingeschaltet hat. Zeigt nie Namen.
"""

from django.conf import settings
from django.http import Http404, HttpResponse
from django.utils.html import escape
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.regionen import formattext

from .models import Reise, Sichtbarkeit, TStatus


def _reise_oder_404(pk) -> Reise:
    try:
        return Reise.objects.exclude(sichtbarkeit=Sichtbarkeit.EINGELADEN).get(
            pk=pk, vorschau_oeffentlich=True, abgesagt=False
        )
    except (Reise.DoesNotExist, ValueError, TypeError) as exc:
        raise Http404 from exc


class ReiseOeffentlichView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        r = _reise_oder_404(pk)
        dabei = r.teilnehmer.filter(status=TStatus.DABEI).count()
        interessiert = r.teilnehmer.filter(status=TStatus.INTERESSIERT).count()
        return Response(
            {
                "id": str(r.id),
                "titel": r.titel,
                "ziel_ort": r.ziel_ort,
                "land": r.land,
                "start": r.start.isoformat() if r.start else None,
                "ende": r.ende.isoformat() if r.ende else None,
                "beschreibung": formattext.bereinige(r.beschreibung),
                "interessiert": dabei + interessiert,
            }
        )


class ReiseTeilenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        r = _reise_oder_404(pk)
        basis = settings.FRONTEND_URL.rstrip("/")
        ziel = f"{basis}/reise/{r.id}"
        beschreibung = (
            formattext.klartext(r.beschreibung)[:200] or "Eine Reise von Clubistes in Deutschland."
        )
        titel = escape(r.titel)
        html = f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>{titel}</title>
<meta name="description" content="{escape(beschreibung)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Clubistes in Deutschland">
<meta property="og:title" content="{titel}">
<meta property="og:description" content="{escape(beschreibung)}">
<meta property="og:url" content="{escape(ziel)}">
<meta property="og:image" content="{escape(basis)}/brand/logo-cid-couleur.png">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url={escape(ziel)}">
<link rel="canonical" href="{escape(ziel)}">
</head>
<body>
<p><a href="{escape(ziel)}">{titel}</a></p>
</body>
</html>"""
        antwort = HttpResponse(html, content_type="text/html; charset=utf-8")
        antwort["Cache-Control"] = "public, max-age=300"
        return antwort

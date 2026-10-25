"""Öffentliche Seite einer Beitragsaktion (Wunsch Ghazi, 2026-10-25) : ohne Anmeldung sichtbar,
damit eine Aktion in Social Media geteilt werden kann. Zwei Adressen :

  GET /aktionen/<id>/         JSON für die öffentliche App-Seite (Titel, Beschreibung, Frist,
                              Fortschritt). Nie Namen oder Beträge einzelner Personen.
  GET /aktionen/<id>/teilen/  Kleine HTML-Seite mit Open-Graph-Angaben für die Vorschau in
                              WhatsApp, Facebook, X usw. Menschen werden zur App-Seite
                              weitergeleitet. Nötig, weil die App ohne Server-Rendering keine
                              Vorschau liefert.

Nur Aktionen mit `oeffentlich=True`, `actif=True` und ohne `type_fixe` sind erreichbar ; alles
andere ist 404 (verrät nicht, ob es die Aktion gibt)."""

from django.conf import settings
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.html import escape
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.regionen import formattext

from .models import ArticleCatalogue


def _aktion_oder_404(pk) -> ArticleCatalogue:
    try:
        return get_object_or_404(
            ArticleCatalogue, pk=pk, oeffentlich=True, actif=True, type_fixe__isnull=True
        )
    except (ValueError, TypeError) as exc:
        raise Http404 from exc


def _daten(artikel: ArticleCatalogue) -> dict:
    summe, anzahl = artikel.fortschritt()
    fortschritt = None
    if artikel.zielbetrag:
        fortschritt = int(min(100, (summe / artikel.zielbetrag) * 100))
    return {
        "id": str(artikel.id),
        "titel": artikel.libelle,
        "beschreibung": formattext.bereinige(artikel.beschreibung),
        "betrag": f"{artikel.montant:.2f}",
        "betrag_erhoehbar": artikel.betrag_erhoehbar,
        "frist": artikel.frist.isoformat() if artikel.frist else None,
        "abgelaufen": artikel.abgelaufen,
        "dringend": artikel.dringend,
        "zielbetrag": f"{artikel.zielbetrag:.2f}" if artikel.zielbetrag else None,
        "gesammelt": f"{summe:.2f}",
        "beitragende": anzahl,
        "fortschritt": fortschritt,
    }


class AktionOeffentlichView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        return Response(_daten(_aktion_oder_404(pk)))


class AktionTeilenView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request, pk):
        artikel = _aktion_oder_404(pk)
        basis = settings.FRONTEND_URL.rstrip("/")
        ziel = f"{basis}/aktion/{artikel.id}"
        beschreibung = formattext.klartext(artikel.beschreibung)[:200] or (
            "Unterstützt diese Aktion von Clubistes in Deutschland."
        )
        titel = escape(artikel.libelle)
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

"""Verwaltungs-API der Übersetzungen (nur ab Rolle Bureau Admin)."""

from django.apps import apps
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ROLE_LEVELS, Role

from . import deepl
from .models import SPRACHEN, Uebersetzung
from .registry import HTML_FELDER, UEBERSETZBAR
from .services import felder_von, hash_von, manuell_speichern, uebersetze_objekt


class VerwaltungPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and ROLE_LEVELS.get(user.role, 0) >= ROLE_LEVELS[Role.BUREAU_ADMIN]
        )


def _objekt(modell, pk):
    if modell not in UEBERSETZBAR:
        raise NotFound()
    try:
        obj = apps.get_model(modell).objects.filter(pk=pk).first()
    except (ValueError, TypeError, Exception) as exc:  # noqa: BLE001 — ungültiger UUID/ID
        raise NotFound() from exc
    if obj is None:
        raise NotFound()
    return obj


def _darstellung(obj):
    from django.contrib.contenttypes.models import ContentType

    ct = ContentType.objects.get_for_model(obj)
    gespeichert = {
        (u.feld, u.sprache): u
        for u in Uebersetzung.objects.filter(content_type=ct, objekt_id=str(obj.pk))
    }
    felder = []
    for feld in felder_von(obj):
        original = (getattr(obj, feld, "") or "").strip()
        aktuell = hash_von(original)
        sprachen = {}
        for sprache in SPRACHEN:
            u = gespeichert.get((feld, sprache))
            ok = u is not None and u.quell_hash == aktuell
            sprachen[sprache] = {
                "text": u.text if ok else "",
                "automatisch": u.automatisch if ok else True,
            }
        felder.append(
            {"feld": feld, "original": original, "html": feld in HTML_FELDER, "sprachen": sprachen}
        )
    return {"aktiv": deepl.ist_aktiv(), "felder": felder}


class UebersetzungStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"aktiv": deepl.ist_aktiv()})


class UebersetzungObjektView(APIView):
    permission_classes = [IsAuthenticated, VerwaltungPermission]

    def get(self, request, modell, pk):
        return Response(_darstellung(_objekt(modell, pk)))

    def put(self, request, modell, pk):
        obj = _objekt(modell, pk)
        feld = request.data.get("feld")
        sprache = request.data.get("sprache")
        text = request.data.get("text", "")
        try:
            manuell_speichern(obj, feld, sprache, text if isinstance(text, str) else "")
        except ValueError as exc:
            raise ValidationError({"feld": "Unbekanntes Feld oder unbekannte Sprache."}) from exc
        return Response(_darstellung(obj))


class UebersetzungNeuView(APIView):
    """POST — übersetzt alle Felder des Objekts mit DeepL neu (überschreibt auch manuelle
    Korrekturen)."""

    permission_classes = [IsAuthenticated, VerwaltungPermission]

    def post(self, request, modell, pk):
        obj = _objekt(modell, pk)
        if not deepl.ist_aktiv():
            raise ValidationError({"detail": "DeepL ist nicht konfiguriert (DEEPL_API_KEY)."})
        uebersetze_objekt(obj, erzwingen=True)
        return Response(_darstellung(obj))

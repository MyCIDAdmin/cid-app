"""Chats — Zusammenführung von „Nachrichten“ (1:1) und „Chatgruppen“ (Oktober 2026).

Gemeinsame Chat-Liste, persönliche Einstellungen (stumm/angeheftet), Reaktionen, Umfragen,
Treffpunkt, GIFs (GIPHY über unseren Server, ohne Kennung der Mitglieder), Übersetzung (DeepL)
und die Hilfsfunktionen, die Serializer, Consumer und Views gemeinsam brauchen.

Der Versand bleibt wie bisher ausschließlich im WebSocket (siehe consumers.py) ; hier liegt die
Prüfung der Zusatzdaten je Nachrichtenart (`bereinige_daten`)."""

import re
from datetime import datetime
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import ROLE_LEVELS
from apps.rbac.services import acces_cle_menu
from apps.uebersetzung import deepl

from .models import (
    ChatEinstellung,
    ChatReaktion,
    Conversation,
    GroupeChat,
    MembreGroupe,
    MessageGroupe,
    MessagePrive,
    NachrichtArt,
    UmfrageStimme,
)
from .permissions import MODERATION_MIN_LEVEL

ONLINE_TTL = 90  # Sekunden — die Chat-Liste meldet sich alle 30 s, solange sie offen ist
MAX_OPTIONEN = 6
MAX_EMOJI_LAENGE = 16
GIF_HOST = re.compile(r"^(media\d*|i)\.giphy\.com$")


def cle_online(membre_id) -> str:
    return f"communaute:online:{membre_id}"


def membre_von(request):
    membre = getattr(request.user, "membre", None)
    if membre is None:
        raise PermissionDenied("Aucune fiche membre associée à ce compte.")
    return membre


# --- Zusatzdaten je Nachrichtenart -----------------------------------------------------------


def _https_url(wert, *, host_regex=None) -> str:
    if not isinstance(wert, str) or len(wert) > 500:
        raise ValidationError({"daten": "Ungültige Adresse."})
    teile = urlparse(wert)
    if teile.scheme != "https" or not teile.hostname:
        raise ValidationError({"daten": "Nur https-Adressen sind erlaubt."})
    if host_regex is not None and not host_regex.match(teile.hostname):
        raise ValidationError({"daten": "Adresse nicht erlaubt."})
    return wert


def bereinige_daten(art: str, daten) -> dict | None:
    """Prüft und normalisiert die Zusatzdaten einer Nachricht. Wirft ValidationError."""
    if art in (NachrichtArt.TEXT, NachrichtArt.SYSTEM):
        return None
    if not isinstance(daten, dict):
        raise ValidationError({"daten": "Zusatzdaten fehlen."})
    if art == NachrichtArt.GIF:
        return {
            "url": _https_url(daten.get("url"), host_regex=GIF_HOST),
            "vorschau": _https_url(daten.get("vorschau") or daten.get("url"), host_regex=GIF_HOST),
            "titel": str(daten.get("titel") or "")[:120],
        }
    if art == NachrichtArt.TREFFPUNKT:
        ort = str(daten.get("ort") or "").strip()[:160]
        if not ort:
            raise ValidationError({"daten": "Ort fehlt."})
        link = daten.get("link")
        return {
            "ort": ort,
            "zeit": str(daten.get("zeit") or "").strip()[:60],
            "link": _https_url(link) if link else "",
        }
    if art == NachrichtArt.UMFRAGE:
        frage = str(daten.get("frage") or "").strip()[:200]
        optionen = [str(o).strip()[:80] for o in (daten.get("optionen") or []) if str(o).strip()]
        if not frage or not 2 <= len(optionen) <= MAX_OPTIONEN:
            raise ValidationError({"daten": "Frage und 2 bis 6 Antworten nötig."})
        frist = daten.get("frist") or ""
        if frist:
            try:
                datetime.fromisoformat(str(frist).replace("Z", "+00:00"))
            except ValueError as exc:
                raise ValidationError({"daten": "Frist ungültig."}) from exc
        return {"frage": frage, "optionen": optionen, "frist": str(frist)}
    raise ValidationError({"art": "Unbekannte Nachrichtenart."})


def umfrage_beendet(message) -> bool:
    frist = (message.daten or {}).get("frist")
    if not frist:
        return False
    try:
        ende = datetime.fromisoformat(str(frist).replace("Z", "+00:00"))
    except ValueError:
        return False
    if timezone.is_naive(ende):
        ende = timezone.make_aware(ende)
    return ende <= timezone.now()


def umfrage_ergebnis(message, membre_id=None) -> dict | None:
    if message.art != NachrichtArt.UMFRAGE:
        return None
    optionen = (message.daten or {}).get("optionen", [])
    zaehler = [0] * len(optionen)
    meine = None
    for stimme in message.stimmen.all():
        if 0 <= stimme.option < len(zaehler):
            zaehler[stimme.option] += 1
        if membre_id is not None and stimme.membre_id == membre_id:
            meine = stimme.option
    return {
        "zaehler": zaehler,
        "gesamt": sum(zaehler),
        "meine": meine,
        "beendet": umfrage_beendet(message),
    }


def reaktionen_liste(message, membre_id=None) -> list[dict]:
    """[{emoji, anzahl, ich}] in der Reihenfolge der ersten Verwendung."""
    gezaehlt: dict[str, dict] = {}
    for r in sorted(message.reaktionen.all(), key=lambda x: x.created_at):
        eintrag = gezaehlt.setdefault(r.emoji, {"emoji": r.emoji, "anzahl": 0, "ich": False})
        eintrag["anzahl"] += 1
        if membre_id is not None and r.membre_id == membre_id:
            eintrag["ich"] = True
    return list(gezaehlt.values())


# --- Zugriffsregeln ---------------------------------------------------------------------------


def darf_in_gruppe(groupe: GroupeChat, membre) -> bool:
    if groupe.type_groupe == "public":
        return True
    return groupe.membres_groupe.filter(membre=membre).exists()


def darf_anheften(user, membre, message) -> bool:
    if isinstance(message, MessagePrive):
        return message.conversation.participant(membre)
    groupe = message.groupe
    if groupe.type_groupe == "public":
        return (
            groupe.createur_id == membre.id or ROLE_LEVELS.get(user.role, 0) >= MODERATION_MIN_LEVEL
        )
    return groupe.membres_groupe.filter(membre=membre).exists()


def sende_an_gruppe(group_name: str, typ: str, payload: dict) -> None:
    from asgiref.sync import async_to_sync
    from channels.layers import get_channel_layer

    layer = get_channel_layer()
    if layer is None:
        return
    async_to_sync(layer.group_send)(group_name, {"type": typ, "payload": payload})


def kanal_von(message) -> str:
    if isinstance(message, MessagePrive):
        return f"messagerie_{message.conversation_id}"
    return f"groupe_{message.groupe_id}"


def reagieren(message, membre, emoji: str):
    emoji = (emoji or "").strip()
    if not emoji or len(emoji) > MAX_EMOJI_LAENGE:
        raise ValidationError({"emoji": "Ungültiges Emoji."})
    feld = "message_prive" if isinstance(message, MessagePrive) else "message_groupe"
    r, neu = ChatReaktion.objects.get_or_create(membre=membre, emoji=emoji, **{feld: message})
    aktiv = neu
    if not neu:
        r.delete()
    anzahl = ChatReaktion.objects.filter(emoji=emoji, **{feld: message}).count()
    sende_an_gruppe(
        kanal_von(message),
        "message_reaktion",
        {
            "id": str(message.id),
            "emoji": emoji,
            "anzahl": anzahl,
            "membre_id": str(membre.id),
            "aktiv": aktiv,
        },
    )


def anheften_umschalten(message):
    message.angeheftet = not message.angeheftet
    message.save(update_fields=["angeheftet"])
    sende_an_gruppe(
        kanal_von(message),
        "message_angeheftet",
        {"id": str(message.id), "angeheftet": message.angeheftet},
    )


def abstimmen(message: MessageGroupe, membre, option) -> None:
    if message.art != NachrichtArt.UMFRAGE:
        raise ValidationError({"detail": "Keine Umfrage."})
    if umfrage_beendet(message):
        raise ValidationError({"detail": "Die Umfrage ist beendet."})
    anzahl = len((message.daten or {}).get("optionen", []))
    if not isinstance(option, int) or isinstance(option, bool) or not 0 <= option < anzahl:
        raise ValidationError({"option": "Ungültige Antwort."})
    bisher = UmfrageStimme.objects.filter(message=message, membre=membre).first()
    if bisher is not None and bisher.option == option:
        bisher.delete()  # nochmal antippen nimmt die Stimme zurück
    else:
        UmfrageStimme.objects.update_or_create(
            message=message, membre=membre, defaults={"option": option}
        )
    message = MessageGroupe.objects.prefetch_related("stimmen").get(pk=message.pk)
    ergebnis = umfrage_ergebnis(message)
    sende_an_gruppe(
        kanal_von(message),
        "umfrage_update",
        {"id": str(message.id), "zaehler": ergebnis["zaehler"], "gesamt": ergebnis["gesamt"]},
    )


def systemnachricht(groupe: GroupeChat, text: str) -> MessageGroupe | None:
    """Systemzeile im Gruppenchat (z. B. „Anna ist dabei“). Der Autor ist der Ersteller."""
    message = MessageGroupe.objects.create(
        groupe=groupe, auteur_id=groupe.createur_id, contenu=text[:300], art=NachrichtArt.SYSTEM
    )
    sende_an_gruppe(
        f"groupe_{groupe.id}",
        "message_recu",
        {
            "id": str(message.id),
            "groupe": str(groupe.id),
            "auteur": {"id": str(groupe.createur_id)},
            "contenu": message.contenu,
            "art": NachrichtArt.SYSTEM,
            "daten": None,
            "angeheftet": False,
            "reaktionen": [],
            "umfrage": None,
            "created_at": message.created_at.isoformat(),
            "nombre_likes": 0,
            "repond_a": None,
            "repond_a_detail": None,
        },
    )
    return message


# --- Chat-Liste -------------------------------------------------------------------------------


def _vorschau(art: str, text: str, daten) -> str:
    if art == NachrichtArt.GIF:
        return "GIF"
    if art == NachrichtArt.UMFRAGE:
        return f"Umfrage: {(daten or {}).get('frage', '')}"
    if art == NachrichtArt.TREFFPUNKT:
        return f"Treffpunkt: {(daten or {}).get('ort', '')}"
    return text or ""


class ChatListeView(APIView):
    """GET /communaute/chats/ — alle meine Direktchats und Gruppen in einer Liste."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.reisen.models import Reise

        membre = membre_von(request)
        cache.set(cle_online(membre.id), True, timeout=ONLINE_TTL)
        einstellungen = {
            (e.conversation_id or e.groupe_id): e
            for e in ChatEinstellung.objects.filter(membre=membre)
        }
        items = []
        direkt_offen = acces_cle_menu(request.user, "messagerie")
        gruppen_offen = acces_cle_menu(request.user, "groupes")

        konversationen = (
            Conversation.objects.filter(Q(membre_a=membre) | Q(membre_b=membre))
            .select_related("membre_a", "membre_b")
            .annotate(
                nicht_gelesen=Count(
                    "messages",
                    filter=Q(messages__est_lu=False) & ~Q(messages__expediteur=membre),
                ),
                letzte_zeit=Max("messages__created_at"),
            )
        )
        for c in konversationen if direkt_offen else []:
            partner = c.autre_participant(membre)
            letzte = c.messages.order_by("-created_at").select_related("expediteur").first()
            e = einstellungen.get(c.id)
            items.append(
                {
                    "art": "direkt",
                    "id": str(c.id),
                    "name": f"{partner.prenom} {partner.nom}".strip(),
                    "partner": {
                        "id": str(partner.id),
                        "prenom": partner.prenom,
                        "nom": partner.nom,
                        "photo": partner.photo.url if partner.photo else None,
                    },
                    "online": bool(cache.get(cle_online(partner.id))),
                    "privat": None,
                    "anzahl_mitglieder": 2,
                    "reise": None,
                    "nicht_gelesen": c.nicht_gelesen,
                    "stumm": bool(e and e.stumm),
                    "angeheftet": bool(e and e.angeheftet),
                    "letzte": (
                        {
                            "text": _vorschau(letzte.art, letzte.contenu, letzte.daten),
                            "art": letzte.art,
                            "ich": letzte.expediteur_id == membre.id,
                            "von": letzte.expediteur.prenom,
                            "zeit": letzte.created_at,
                        }
                        if letzte
                        else None
                    ),
                    "aktivitaet": c.letzte_zeit or c.created_at,
                }
            )

        mitgliedschaften = (
            MembreGroupe.objects.filter(membre=membre)
            .select_related("groupe")
            .annotate(anzahl=Count("groupe__membres_groupe"))
        )
        reisen = {
            r.chat_gruppe_id: r
            for r in Reise.objects.filter(
                chat_gruppe_id__in=[m.groupe_id for m in mitgliedschaften]
            ).only("id", "titel", "chat_gruppe_id")
        }
        for m in mitgliedschaften if gruppen_offen else []:
            g = m.groupe
            letzte = g.messages.order_by("-created_at").select_related("auteur").first()
            nicht_gelesen = 0
            if m.zuletzt_gelesen is not None:
                nicht_gelesen = (
                    g.messages.filter(created_at__gt=m.zuletzt_gelesen)
                    .exclude(auteur=membre)
                    .exclude(art=NachrichtArt.SYSTEM)
                    .count()
                )
            e = einstellungen.get(g.id)
            reise = reisen.get(g.id)
            items.append(
                {
                    "art": "reise" if reise else "gruppe",
                    "id": str(g.id),
                    "name": (
                        g.nom[len("Reise: ") :] if reise and g.nom.startswith("Reise: ") else g.nom
                    ),
                    "partner": None,
                    "online": None,
                    "privat": g.type_groupe == "prive",
                    "anzahl_mitglieder": m.anzahl,
                    "reise": {"id": str(reise.id), "titel": reise.titel} if reise else None,
                    "nicht_gelesen": nicht_gelesen,
                    "stumm": bool(e and e.stumm),
                    "angeheftet": bool(e and e.angeheftet),
                    "letzte": (
                        {
                            "text": _vorschau(letzte.art, letzte.contenu, letzte.daten),
                            "art": letzte.art,
                            "ich": letzte.auteur_id == membre.id,
                            "von": letzte.auteur.prenom,
                            "zeit": letzte.created_at,
                        }
                        if letzte
                        else None
                    ),
                    "aktivitaet": letzte.created_at if letzte else g.created_at,
                }
            )

        items.sort(key=lambda i: i["aktivitaet"], reverse=True)
        return Response(items)


class ChatEinstellungView(APIView):
    """PATCH /communaute/chats/einstellung/ {art, id, stumm?, angeheftet?}"""

    permission_classes = [IsAuthenticated]

    def patch(self, request):
        membre = membre_von(request)
        art = request.data.get("art")
        chat_id = request.data.get("id")
        if art == "direkt":
            c = Conversation.objects.filter(id=chat_id).first()
            if c is None or not c.participant(membre):
                raise PermissionDenied("Vous n'êtes pas participant de cette conversation.")
            ziel = {"conversation": c}
        elif art in ("gruppe", "reise"):
            g = GroupeChat.objects.filter(id=chat_id).first()
            if g is None or not g.membres_groupe.filter(membre=membre).exists():
                raise PermissionDenied("Vous n'êtes pas membre de ce groupe.")
            ziel = {"groupe": g}
        else:
            raise ValidationError({"art": "Unbekannte Chatart."})
        e, _neu = ChatEinstellung.objects.get_or_create(membre=membre, **ziel)
        for feld in ("stumm", "angeheftet"):
            if feld in request.data:
                setattr(e, feld, bool(request.data[feld]))
        e.save()
        return Response({"stumm": e.stumm, "angeheftet": e.angeheftet})


# --- GIFs und Übersetzung ---------------------------------------------------------------------


def gif_aktiv() -> bool:
    return bool(getattr(settings, "GIPHY_API_KEY", ""))


class GifStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            {"gif": gif_aktiv(), "uebersetzung": deepl.ist_aktiv()},
        )


class GifSucheView(APIView):
    """GET /communaute/gifs/?q= — Suche bei GIPHY über unseren Server, ohne Kennung des
    Mitglieds. Ohne `GIPHY_API_KEY` → 503 (die Oberfläche blendet GIFs dann aus)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not gif_aktiv():
            return Response(
                {"detail": "gif_nicht_aktiv"}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        suche = (request.query_params.get("q") or "").strip()[:60]
        basis = "https://api.giphy.com/v1/gifs/"
        parameter = {
            "api_key": settings.GIPHY_API_KEY,
            "limit": 24,
            "rating": "g",
            "lang": "de",
        }
        if suche:
            url, parameter["q"] = basis + "search", suche
        else:
            url = basis + "trending"
        try:
            antwort = requests.get(url, params=parameter, timeout=8)
            antwort.raise_for_status()
            daten = antwort.json().get("data", [])
        except (requests.RequestException, ValueError):
            return Response({"detail": "gif_fehler"}, status=status.HTTP_502_BAD_GATEWAY)
        ergebnisse = []
        for g in daten:
            bilder = g.get("images", {})
            original = (bilder.get("downsized_medium") or bilder.get("original") or {}).get("url")
            vorschau = (bilder.get("fixed_height_small") or bilder.get("fixed_height") or {}).get(
                "url"
            )
            if not original or not vorschau:
                continue
            ergebnisse.append(
                {
                    "id": g.get("id"),
                    "url": original.split("?")[0],
                    "vorschau": vorschau.split("?")[0],
                    "titel": (g.get("title") or "")[:120],
                }
            )
        return Response({"ergebnisse": ergebnisse})


class UebersetzenView(APIView):
    """POST /communaute/uebersetzen/ {text, ziel: de|fr} — Übersetzung einer Nachricht
    auf Tipp (nicht automatisch). Ohne DeepL-Schlüssel → 503."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not deepl.ist_aktiv():
            return Response(
                {"detail": "uebersetzung_nicht_aktiv"}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        text = str(request.data.get("text") or "").strip()[:2000]
        ziel = request.data.get("ziel")
        if not text or ziel not in ("de", "fr"):
            raise ValidationError({"detail": "Text und Zielsprache (de/fr) nötig."})
        ergebnis = deepl.uebersetzen(text, ziel)
        if ergebnis is None:
            return Response({"detail": "uebersetzung_fehler"}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({"text": ergebnis[0], "quelle": ergebnis[1]})


class ReiseMitreisendeView(APIView):
    """GET /communaute/chats/mitreisende/ — meine Reisen (Status „dabei“) mit den anderen
    Mitreisenden, für die Schnellauswahl „Alle Mitreisenden“ im Dialog „Neuer Chat“."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.reisen.models import Reise, ReiseTeilnehmer, TStatus

        membre_von(request)
        reisen = (
            Reise.objects.filter(
                teilnehmer__user=request.user, teilnehmer__status=TStatus.DABEI, abgesagt=False
            )
            .exclude(phase="abgeschlossen")
            .distinct()
        )
        ergebnis = []
        for reise in reisen:
            mitglieder = (
                ReiseTeilnehmer.objects.filter(reise=reise, status=TStatus.DABEI)
                .exclude(user=request.user)
                .select_related("user__membre")
            )
            liste = []
            for tn in mitglieder:
                m = getattr(tn.user, "membre", None)
                if m is not None:
                    liste.append({"id": str(m.id), "prenom": m.prenom, "nom": m.nom})
            if liste:
                ergebnis.append({"id": str(reise.id), "titel": reise.titel, "mitglieder": liste})
        return Response(ergebnis)

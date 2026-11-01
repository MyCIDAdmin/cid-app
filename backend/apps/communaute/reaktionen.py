"""Emoji-Reaktionen auf Neuigkeiten, Kommentare, Forumsthemen und -antworten.

Dünne Hilfsschicht über dem Modell `Reaktion` (siehe dort) – bewusst getrennt von `chats.py`,
das seine Reaktionen live über WebSocket verteilt ; Neuigkeiten und Forum sind reines REST
(wie die übrigen Aktionen dieser Viewsets), die Antwort der Aktion liefert den neuen Stand.
"""

from rest_framework.exceptions import ValidationError

from .chats import MAX_EMOJI_LAENGE
from .models import Reaktion

# Feldname am Modell Reaktion je Zieltyp.
ZIELFELD = {
    "Publication": "publication",
    "Commentaire": "commentaire",
    "Sujet": "sujet",
    "ReponseForum": "reponse_forum",
}


def _feld(ziel) -> str:
    return ZIELFELD[type(ziel).__name__]


def umschalten(ziel, membre, emoji: str) -> bool:
    """Reaktion setzen oder – falls schon vorhanden – wieder entfernen. Gibt True zurück, wenn
    die Reaktion danach aktiv ist."""
    emoji = (emoji or "").strip()
    if not emoji or len(emoji) > MAX_EMOJI_LAENGE:
        raise ValidationError({"emoji": "Ungültiges Emoji."})
    r, neu = Reaktion.objects.get_or_create(membre=membre, emoji=emoji, **{_feld(ziel): ziel})
    if not neu:
        r.delete()
    return neu


def reaktionen_liste(ziel, membre_id=None, neu_laden=False) -> list[dict]:
    """[{emoji, anzahl, ich}] in der Reihenfolge der ersten Verwendung. Nutzt den Prefetch
    `reaktionen` des Querysets, sonst eine Abfrage je Ziel. `neu_laden=True` umgeht den
    Prefetch – nötig direkt nach `umschalten()`, wo der Cache veraltet ist."""
    if neu_laden:
        quelle = Reaktion.objects.filter(**{_feld(ziel): ziel})
    else:
        quelle = ziel.reaktionen.all()
    gezaehlt: dict[str, dict] = {}
    for r in sorted(quelle, key=lambda x: x.created_at):
        eintrag = gezaehlt.setdefault(r.emoji, {"emoji": r.emoji, "anzahl": 0, "ich": False})
        eintrag["anzahl"] += 1
        if membre_id is not None and r.membre_id == membre_id:
            eintrag["ich"] = True
    return list(gezaehlt.values())

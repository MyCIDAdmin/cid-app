"""Vorteile eines Angebots (OffreAdhesion.avantages) : erlaubte Symbole, Ziele und Prüfung.

Jeder Vorteil ist ein kleines JSON-Objekt ``{"ordre", "texte_fr", "texte_de", "texte_ar"}``. Seit
Release 2026.11 (Seite „Meine Mitgliedschaft“ mit Vorteile-Kacheln) kann ein Vorteil zusätzlich ein
``icone`` (Symbol) und ein ``ziel`` (Seite der App, zu der die Kachel führt) tragen. Beides sind
feste Schlüssel aus den Listen unten, keine freien Texte oder Adressen : so kann kein Vorteil auf
eine fremde Seite zeigen, und das Frontend ordnet jedem Schlüssel Symbol und Route zu.

Alte Vorteile ohne ``icone``/``ziel`` bleiben gültig (die Kachel zeigt dann ein Häkchen ohne Link).
Die Schlüssel stehen bewusst auch im Frontend (``components/adhesions/vorteile.tsx``) ; ein Test auf
beiden Seiten hält die Listen gleich.
"""

from __future__ import annotations

from typing import Any

from rest_framework import serializers

#: Symbole, die ein Vorteil tragen kann (Reihenfolge = Reihenfolge im Auswahlfeld).
ICONS: tuple[str, ...] = (
    "check",
    "card",
    "vote",
    "bag",
    "ticket",
    "car",
    "gift",
    "star",
    "users",
    "calendar",
    "heart",
    "camera",
    "chat",
    "trophy",
)

#: Seiten, zu denen eine Vorteil-Kachel führen darf.
ZIELE: tuple[str, ...] = (
    "shop",
    "veranstaltungen",
    "reisen",
    "tickets",
    "fanclub",
    "votes",
    "alben",
    "kalender",
    "chats",
    "projekte",
)

MAX_VORTEILE = 30
MAX_TEXT_LAENGE = 200


def pruefe_vorteile(wert: Any) -> list[dict[str, Any]]:
    """Prüft die Vorteilsliste eines Angebots und gibt sie bereinigt zurück.

    - Liste von Objekten, höchstens ``MAX_VORTEILE`` Einträge ;
    - ``texte_fr`` Pflicht (nicht leer, höchstens ``MAX_TEXT_LAENGE`` Zeichen) ;
    - ``icone``/``ziel`` leer oder aus ``ICONS``/``ZIELE`` ;
    - fehlende ``ordre`` werden nach der Position vergeben ; unbekannte Felder bleiben unberührt.
    """
    if not isinstance(wert, list):
        raise serializers.ValidationError("Die Vorteile müssen eine Liste sein.")
    if len(wert) > MAX_VORTEILE:
        raise serializers.ValidationError(f"Höchstens {MAX_VORTEILE} Vorteile pro Angebot.")

    bereinigt: list[dict[str, Any]] = []
    for position, eintrag in enumerate(wert, start=1):
        if not isinstance(eintrag, dict):
            raise serializers.ValidationError(f"Vorteil {position}: Objekt erwartet.")
        text = eintrag.get("texte_fr")
        if not isinstance(text, str) or not text.strip():
            raise serializers.ValidationError(f"Vorteil {position}: Text fehlt.")
        if len(text) > MAX_TEXT_LAENGE:
            raise serializers.ValidationError(
                f"Vorteil {position}: Text zu lang (höchstens {MAX_TEXT_LAENGE} Zeichen)."
            )
        icone = eintrag.get("icone", "")
        if icone not in ("", None) and icone not in ICONS:
            raise serializers.ValidationError(f"Vorteil {position}: unbekanntes Symbol.")
        ziel = eintrag.get("ziel", "")
        if ziel not in ("", None) and ziel not in ZIELE:
            raise serializers.ValidationError(f"Vorteil {position}: unbekanntes Ziel.")
        ordre = eintrag.get("ordre", position)
        if isinstance(ordre, bool) or not isinstance(ordre, int):
            raise serializers.ValidationError(f"Vorteil {position}: ungültige Reihenfolge.")
        neu = dict(eintrag)
        neu["texte_fr"] = text.strip()
        neu["ordre"] = ordre
        neu["icone"] = icone or ""
        neu["ziel"] = ziel or ""
        bereinigt.append(neu)
    return bereinigt

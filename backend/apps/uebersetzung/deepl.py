"""Dünner Client für die DeepL-API (https://developers.deepl.com/docs/api-reference/translate).
Ohne `DEEPL_API_KEY` ist der Dienst inaktiv: alle Funktionen liefern None und es wird nichts
übersetzt (die Oberfläche zeigt dann den Originaltext)."""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

ZIEL = {"de": "DE", "fr": "FR", "ar": "AR"}


def ist_aktiv() -> bool:
    return bool(getattr(settings, "DEEPL_API_KEY", ""))


def _basis_url() -> str:
    schluessel = settings.DEEPL_API_KEY
    return "https://api-free.deepl.com" if schluessel.endswith(":fx") else "https://api.deepl.com"


def uebersetzen(text: str, ziel: str, *, html: bool = False):
    """Übersetzt `text` nach `ziel` (de/fr/ar). Liefert (übersetzter Text, erkannte
    Quellsprache klein) oder None bei Fehler/inaktivem Dienst."""
    if not ist_aktiv() or not text.strip() or ziel not in ZIEL:
        return None
    daten = {"text": [text], "target_lang": ZIEL[ziel]}
    if html:
        daten["tag_handling"] = "html"
    try:
        antwort = requests.post(
            f"{_basis_url()}/v2/translate",
            json=daten,
            headers={"Authorization": f"DeepL-Auth-Key {settings.DEEPL_API_KEY}"},
            timeout=20,
        )
        antwort.raise_for_status()
        ergebnis = antwort.json()["translations"][0]
    except (requests.RequestException, KeyError, IndexError, ValueError):
        logger.warning("DeepL-Übersetzung fehlgeschlagen", exc_info=True)
        return None
    return ergebnis["text"], ergebnis.get("detected_source_language", "").lower()[:2]

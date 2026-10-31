"""
Web-Push (Release 2026.11) : Benachrichtigungen zusätzlich als Push aufs Handy oder den Computer.

Datensparsamkeit : gesendet werden nur Titel, Link (Pfad in der App) und eine Kennung, nie der
Inhalt (`message`) — wie bei Telegram. Die Nutzlast ist nach RFC 8291 für das Gerät verschlüsselt.
Ohne VAPID-Schlüssel (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) tut dieses Modul nichts.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from urllib.parse import urlparse

from django.conf import settings
from django.utils import timezone

from .models import PushAbo, PushEinstellung
from .telegram import ALLE_KATEGORIEN, kategorie_von, sprache_von

logger = logging.getLogger(__name__)

MAX_GERAETE = 10
TTL_SEKUNDEN = 24 * 3600


class PushAboUngueltig(Exception):
    """Der Push-Dienst kennt die Adresse nicht mehr (HTTP 404 oder 410)."""


def push_konfiguriert() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def endpoint_erlaubt(endpoint: str) -> bool:
    """Nur https-Adressen bekannter Push-Dienste. Der Server ruft diese Adresse selbst auf ; ohne
    Prüfung könnte jemand eine interne Adresse eintragen lassen (Server-Side Request Forgery)."""
    if not isinstance(endpoint, str) or len(endpoint) > 1000:
        return False
    teile = urlparse(endpoint)
    if teile.scheme != "https" or not teile.hostname or teile.username or teile.password:
        return False
    if teile.port not in (None, 443):
        return False
    host = teile.hostname.lower()
    return any(host == s or host.endswith("." + s) for s in settings.PUSH_ERLAUBTE_HOSTS)


def einstellung_von(user) -> PushEinstellung:
    obj, _neu = PushEinstellung.objects.get_or_create(
        user=user, defaults={"kategorien": list(ALLE_KATEGORIEN)}
    )
    return obj


def geraet_von(user_agent: str) -> str:
    """Kurze Bezeichnung für die Geräteliste, z. B. „Android · Chrome“ (nicht der volle Text)."""
    ua = user_agent or ""
    if re.search(r"iPhone|iPad|iPod", ua):
        system = "iPhone/iPad"
    elif "Android" in ua:
        system = "Android"
    elif "Windows" in ua:
        system = "Windows"
    elif "Macintosh" in ua or "Mac OS" in ua:
        system = "Mac"
    elif "Linux" in ua:
        system = "Linux"
    else:
        system = "Gerät"
    if re.search(r"Edg(e|A|iOS)?/", ua):
        browser = "Edge"
    elif "SamsungBrowser" in ua:
        browser = "Samsung Internet"
    elif re.search(r"OPR/|Opera", ua):
        browser = "Opera"
    elif re.search(r"Firefox|FxiOS", ua):
        browser = "Firefox"
    elif re.search(r"Chrome|CriOS", ua):
        browser = "Chrome"
    elif "Safari" in ua:
        browser = "Safari"
    else:
        browser = "Browser"
    return f"{system} · {browser}"


def abo_speichern(user, *, endpoint: str, p256dh: str, auth: str, user_agent: str = "") -> PushAbo:
    """Legt das Gerät an oder aktualisiert es (dieselbe Adresse gehört immer nur zu einem Konto)
    und begrenzt die Zahl der Geräte je Konto."""
    abo, _neu = PushAbo.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            "user": user,
            "p256dh": p256dh,
            "auth": auth,
            "geraet": geraet_von(user_agent),
        },
    )
    einstellung_von(user)
    ueberzaehlig = PushAbo.objects.filter(user=user).order_by("-created_at")[MAX_GERAETE:]
    PushAbo.objects.filter(pk__in=[a.pk for a in ueberzaehlig]).delete()
    return abo


def nutzlast_fuer(notification) -> dict:
    """Titel und Link, nie der Inhalt. `link` ist ein Pfad in der App (z. B. /chats/gruppe/1)."""
    lien = notification.lien or "/"
    if not lien.startswith("/"):
        lien = "/"
    return {
        "titel": notification.titre,
        "link": lien,
        "tag": f"n-{notification.pk}",
        "sprache": sprache_von(notification.destinataire),
    }


def _vapid():
    from py_vapid import Vapid02

    return Vapid02.from_raw(settings.VAPID_PRIVATE_KEY.encode())


def sende(abo: PushAbo, nutzlast: dict) -> None:
    """Schickt die Nutzlast an ein Gerät. Wirft `PushAboUngueltig`, wenn der Push-Dienst die
    Adresse nicht mehr kennt (das Gerät wird dann vom Aufrufer gelöscht)."""
    from pywebpush import WebPushException, webpush

    try:
        webpush(
            subscription_info={
                "endpoint": abo.endpoint,
                "keys": {"p256dh": abo.p256dh, "auth": abo.auth},
            },
            data=json.dumps(nutzlast, ensure_ascii=False),
            vapid_private_key=_vapid(),
            vapid_claims={"sub": settings.VAPID_SUBJECT},
            ttl=TTL_SEKUNDEN,
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (404, 410):
            raise PushAboUngueltig() from exc
        raise


def sende_an_konto(user, nutzlast: dict) -> int:
    """Sendet an alle Geräte des Kontos ; unbrauchbare Geräte werden gelöscht. Gibt die Zahl der
    zugestellten Geräte zurück. Fehler einzelner Geräte stoppen die anderen nicht."""
    zugestellt = 0
    for abo in PushAbo.objects.filter(user=user):
        try:
            sende(abo, nutzlast)
        except PushAboUngueltig:
            abo.delete()
            continue
        except Exception:
            logger.warning("Push an Gerät %s nicht zugestellt", abo.pk, exc_info=True)
            continue
        abo.zuletzt_zugestellt = timezone.now()
        abo.save(update_fields=["zuletzt_zugestellt"])
        zugestellt += 1
    return zugestellt


def art_gewaehlt(user, typ: str) -> bool:
    einstellung = PushEinstellung.objects.filter(user=user).first()
    if einstellung is None:
        return False
    return kategorie_von(typ) in einstellung.kategorien


def schluessel_erzeugen() -> tuple[str, str]:
    """Neues Schlüsselpaar : (öffentlich, privat), beide URL-sicheres Base64 ohne Auffüllung."""
    from cryptography.hazmat.primitives import serialization
    from py_vapid import Vapid02

    vapid = Vapid02()
    vapid.generate_keys()
    oeffentlich = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    privat = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")

    def b64(daten: bytes) -> str:
        return base64.urlsafe_b64encode(daten).rstrip(b"=").decode()

    return b64(oeffentlich), b64(privat)

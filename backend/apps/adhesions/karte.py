"""Digitale Mitgliedskarte : QR-Code und Prüfung am Einlass (Release 2026.11).

Der QR enthält nur eine zufällige Kennung (``CID-M:<code>``, Modell ``Mitgliedskarte``), nie
Name oder Nummer. Beim Scannen schlägt der Einlass die Kennung nach und zeigt Name, Angebot
und Gültigkeit. Die Prüfung bucht nichts und ändert nichts.
"""

from __future__ import annotations

import base64
import io
from typing import Any

import qrcode
from django.utils import timezone

from .models import Mitgliedskarte, Souscription, StatutSouscription

#: Präfix im QR : der Scanner erkennt daran eine Mitgliedskarte (Tickets : ``CID-T:``).
QR_PRAEFIX = "CID-M:"


def karte_von(membre) -> Mitgliedskarte:
    """Die Karte des Mitglieds ; wird beim ersten Aufruf angelegt."""
    karte, _ = Mitgliedskarte.objects.get_or_create(membre=membre)
    return karte


def qr_inhalt(karte: Mitgliedskarte) -> str:
    return f"{QR_PRAEFIX}{karte.code}"


def qr_png(karte: Mitgliedskarte) -> bytes:
    bild = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=3)
    bild.add_data(qr_inhalt(karte))
    bild.make(fit=True)
    puffer = io.BytesIO()
    bild.make_image(fill_color="black", back_color="white").save(puffer, format="PNG")
    return puffer.getvalue()


def qr_data_url(karte: Mitgliedskarte) -> str:
    return "data:image/png;base64," + base64.b64encode(qr_png(karte)).decode()


def ist_kartencode(text: str | None) -> bool:
    return (text or "").strip().startswith(QR_PRAEFIX)


def pruefen(text: str) -> dict[str, Any]:
    """Schlägt eine gescannte Mitgliedskarte nach.

    ``ergebnis`` ist ``"karte_gueltig"`` (bezahlte Mitgliedschaft, deren Kampagne heute läuft),
    ``"karte_abgelaufen"`` (Karte bekannt, aber keine laufende bezahlte Mitgliedschaft) oder
    ``"unbekannt"``. Bei bekannter Karte stehen nur Name, Angebot und Gültigkeit im Ergebnis.
    """
    code = (text or "").strip()[len(QR_PRAEFIX) :]
    karte = (
        Mitgliedskarte.objects.select_related("membre").filter(code=code).first() if code else None
    )
    if karte is None:
        return {"ergebnis": "unbekannt"}

    membre = karte.membre
    heute = timezone.localdate()
    laufend = (
        Souscription.objects.select_related("offre", "campagne")
        .filter(
            membre=membre,
            statut=StatutSouscription.PAYEE,
            campagne__date_debut__lte=heute,
            campagne__date_fin__gte=heute,
        )
        .order_by("-campagne__date_fin")
        .first()
    )
    daten: dict[str, Any] = {
        "name": f"{membre.prenom} {membre.nom}".strip(),
        "angebot": laufend.offre.nom if laufend else "",
        "gueltig_bis": laufend.campagne.date_fin.isoformat() if laufend else None,
    }
    return {"ergebnis": "karte_gueltig" if laufend else "karte_abgelaufen", "karte": daten}

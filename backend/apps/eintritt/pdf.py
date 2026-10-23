"""Ticket als PDF (zweisprachig DE/FR) — für den Anhang der Mail und für Telegram.

Das PDF ist die Offline-Fassung : Die Person hat es auch ohne Netz auf dem Handy. Für Telegram
wird es ohne Namen erzeugt (nur Titel, Termin, Personenzahl und QR-Code), weil Telegram ein
Drittanbieter ist ; in der Mail steht zusätzlich der Name.
"""

import base64

from django.template.loader import render_to_string
from weasyprint import HTML

from . import services


def personen_text(erwachsene: int, kinder: int) -> tuple[str, str]:
    de = f"{erwachsene} Erwachsene" if erwachsene != 1 else "1 Erwachsener"
    fr = f"{erwachsene} adulte" + ("s" if erwachsene != 1 else "")
    if kinder:
        de += f" · {kinder} Kind" + ("er" if kinder != 1 else "")
        fr += f" · {kinder} enfant" + ("s" if kinder != 1 else "")
    return de, fr


def datum_text(datum, uhrzeit) -> str:
    text = datum.strftime("%d.%m.%Y")
    if uhrzeit:
        text += f", {uhrzeit.strftime('%H:%M')}"
    return text


def ticket_pdf(ticket, *, mit_name: bool = True) -> bytes:
    daten = services.anzeige(ticket)
    personen_de, personen_fr = personen_text(daten["erwachsene"], daten["kinder"])
    html = render_to_string(
        "eintritt/ticket_pdf.html",
        {
            "titel": daten["titel"],
            "termin": datum_text(daten["datum"], daten["uhrzeit"]),
            "ort": daten["ort"],
            "personen_de": personen_de,
            "personen_fr": personen_fr,
            "name": daten["name"] if mit_name else "",
            "qr": "data:image/png;base64," + base64.b64encode(services.qr_png(ticket)).decode(),
            "code": ticket.code,
        },
    )
    return HTML(string=html).write_pdf()


def dateiname(ticket) -> str:
    daten = services.anzeige(ticket)
    rest = "".join(c if c.isalnum() else "-" for c in daten["titel"])[:40].strip("-")
    return f"CID-Ticket-{rest or 'Veranstaltung'}.pdf"

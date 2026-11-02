"""Aushang (PDF) im CID-Layout: Logo-Kachel, Absender, Anschrift und der Text der Bekanntmachung."""

from django.conf import settings
from django.template.loader import render_to_string
from weasyprint import HTML

from . import services, texte


def aushang_pdf(bk, sprache: str) -> bytes | None:
    fassung = services.fassung(bk, sprache)
    if fassung is None:
        return None
    html = render_to_string(
        "wahlen/aushang.html",
        {
            "sprache": sprache,
            "rtl": sprache == "ar",
            "betreff": fassung["betreff"],
            "inhalt": fassung["html"],
            "maschinell": fassung["maschinell"],
            "mt_hinweis": texte.MT_HINWEIS.get(sprache, ""),
            "verbindlich": texte.FOOTER[sprache],
            "anschrift": [z.strip() for z in settings.VEREIN_ANSCHRIFT.split("·") if z.strip()],
            "datum": bk.versand_am,
        },
    )
    return HTML(string=html).write_pdf()


def protokoll_pdf(wahl) -> bytes:
    from .serializers import protokoll_dict

    daten = protokoll_dict(wahl)
    html = render_to_string(
        "wahlen/protokoll.html",
        {
            "p": daten,
            "anschrift": [z.strip() for z in settings.VEREIN_ANSCHRIFT.split("·") if z.strip()],
        },
    )
    return HTML(string=html).write_pdf()

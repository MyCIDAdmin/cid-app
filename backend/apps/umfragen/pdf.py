"""PDF-Bericht einer Umfrage (Release 13) : Kennzahlen, je Thema und Frage ein Balkendiagramm
(HTML/CSS-Balken, von WeasyPrint sicher darstellbar), Freitext-Antworten und – nur für die
Verwaltung bei namentlichen Umfragen – wer was geantwortet hat. Sprache DE/FR ; Texte der
Umfrage kommen in der Berichtssprache, sofern eine Übersetzung vorliegt (apps.uebersetzung).
Gleiche Bauweise wie apps.stats.pdf (ein HTML-Gabarit, gerendert mit WeasyPrint)."""

from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from apps.stats.pdf import _logo_data_uri

from .models import FrageTyp
from .services import uebersetzungen_fuer_umfrage

TEXTE = {
    "de": {
        "titel": "Umfrage-Bericht",
        "erstellt": "Erstellt am",
        "frist": "Frist",
        "teilnahmen": "Teilnahmen",
        "anonym": "Anonyme Umfrage",
        "namentlich": "Namentliche Umfrage",
        "fragen": "Fragen",
        "ergebnisse": "Ergebnisse",
        "antworten": "Antworten",
        "keine_antworten": "Keine Antworten.",
        "freitext": "Freitext-Antworten",
        "bemerkungen": "Bemerkungen",
        "ohne_thema": "Allgemein",
        "wer_was": "Wer hat was geantwortet?",
        "typ_einzel": "Eine Antwort",
        "typ_mehrfach": "Mehrere Antworten möglich",
        "typ_freitext": "Freitext",
        "footer": "Clubistes in Deutschland — Umfrage-Bericht",
        "tagline": "Club Africain de Tunis — Anhänger in Deutschland",
    },
    "fr": {
        "titel": "Rapport du sondage",
        "erstellt": "Généré le",
        "frist": "Échéance",
        "teilnahmen": "Participations",
        "anonym": "Sondage anonyme",
        "namentlich": "Sondage nominatif",
        "fragen": "Questions",
        "ergebnisse": "Résultats",
        "antworten": "réponses",
        "keine_antworten": "Aucune réponse.",
        "freitext": "Réponses libres",
        "bemerkungen": "Remarques",
        "ohne_thema": "Général",
        "wer_was": "Qui a répondu quoi ?",
        "typ_einzel": "Une seule réponse",
        "typ_mehrfach": "Plusieurs réponses possibles",
        "typ_freitext": "Texte libre",
        "footer": "Clubistes in Deutschland — Rapport du sondage",
        "tagline": "Club Africain de Tunis — Supporters en Allemagne",
    },
}


def _text(eintrag: dict, feld: str, original: str, sprache: str) -> str:
    return (eintrag.get("uebersetzungen") or {}).get(feld, {}).get(sprache) or original


def _gruppen(daten: dict, sprache: str, t: dict) -> list[dict]:
    gruppen: list[dict] = []
    for frage in daten["fragen"]:
        thema = (frage.get("thema") or "").strip()
        gruppe = next((g for g in gruppen if g["schluessel"] == thema), None)
        if gruppe is None:
            anzeige = _text(frage, "thema", thema, sprache) if thema else ""
            gruppe = {"schluessel": thema, "thema": anzeige, "fragen": []}
            gruppen.append(gruppe)
        gruppe["fragen"].append(
            {
                "text": _text(frage, "text", frage["text"], sprache),
                "typ": t[f"typ_{frage['typ']}"],
                "ist_freitext": frage["typ"] == FrageTyp.FREITEXT,
                "beantwortet": frage.get("beantwortet", len(frage.get("freitexte") or [])),
                "optionen": [
                    {
                        "text": _text(o, "text", o["text"], sprache),
                        "anzahl": o["anzahl"],
                        "anteil": o["anteil"],
                    }
                    for o in frage.get("optionen") or []
                ],
                "freitexte": frage.get("freitexte"),
            }
        )
    return gruppen


def erzeuge_bericht_pdf(*, umfrage, daten: dict, sprache: str) -> bytes:
    sprache = sprache if sprache in TEXTE else "de"
    t = TEXTE[sprache]
    uebersetzungen = uebersetzungen_fuer_umfrage(umfrage).get(str(umfrage.pk), {})
    kontext = {
        "t": t,
        "langue": sprache,
        "logo_data_uri": _logo_data_uri(),
        "titel": _text({"uebersetzungen": uebersetzungen}, "titel", umfrage.titel, sprache),
        "beschreibung": _text(
            {"uebersetzungen": uebersetzungen}, "beschreibung", umfrage.beschreibung, sprache
        ),
        "frist": timezone.localtime(umfrage.frist).strftime("%d.%m.%Y %H:%M"),
        "erstellt": timezone.localtime().strftime("%d.%m.%Y"),
        "teilnehmende": daten["teilnehmende"],
        "anonym": daten["anonym"],
        "gruppen": _gruppen(daten, sprache, t),
        "einreichungen": daten.get("einreichungen"),
    }
    html = render_to_string("umfragen/bericht_pdf.html", kontext)
    return HTML(string=html).write_pdf()

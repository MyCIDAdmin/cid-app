"""Mails und Meldungen des Regionen-Moduls (Release 31) — immer zweisprachig.

Jede Mail enthält Deutsch (Hauptsprache) und darunter Französisch im CID-Layout ; die In-App-
Meldung erscheint in der Sprache des Empfängers. Versandfehler stören die Aktion nicht
(`fail_silently`).
"""

from apps.kalender.benachrichtigung import sprache
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.services import notifier

CTA = ("Zur Region", "Vers la région")


def sende_mail(user, de, fr, *, lien: str, details=None, cta=CTA) -> bool:
    """`de`/`fr` = (Titel, Absatz) ; `details` = ([(Name, Wert)] DE, [(Name, Wert)] FR)."""
    if not getattr(user, "email", ""):
        return False
    details_de, details_fr = details or ([], [])
    textes = {
        "de": Texte(titre=de[0], paragraphes=[de[1]], details=details_de, cta=cta[0]),
        "fr": Texte(titre=fr[0], paragraphes=[fr[1]], details=details_fr, cta=cta[1]),
    }
    return bool(
        envoyer_email_cid(
            sujet=f"{de[0]} · {fr[0]}",
            destinataire=user.email,
            textes=textes,
            lien=lien,
            fail_silently=True,
        )
    )


def melde(user, typ, de, fr, *, lien: str, details=None, mail: bool = True) -> None:
    """In-App-Meldung (Sprache des Empfängers) und zweisprachige Mail."""
    if user is None or not user.is_active:
        return
    titel, text = fr if sprache(user) == "fr" else de
    notifier(user, typ, titre=titel, message=text, lien=lien)
    if mail:
        sende_mail(user, de, fr, lien=lien, details=details)


def veranstaltungs_details(v) -> tuple[list, list]:
    """Datum, Uhrzeit und Ort eines Treffens in beiden Sprachen."""
    wann = f"{v.datum:%d.%m.%Y}" + (f", {v.uhrzeit:%H:%M}" if v.uhrzeit else "")
    return (
        [("Datum", wann), ("Ort", v.ort)],
        [("Date", wann), ("Lieu", v.ort)],
    )


def region_link(v) -> str:
    return f"/regionen/{v.region.slug}"

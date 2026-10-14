"""Benachrichtigungen des Kalenders (Release 19) — ein Ort für Texte (DE/FR), Typ und Kanal.

* In-App-Meldung immer, in der Sprache des Empfängers (Deutsch als Rückfalllösung).
* E-Mail nur auf Wunsch des Aufrufers (`mail=True`) UND wenn der App-Admin das Modul „Kalender“
  nicht abgeschaltet hat (`email_module_actif("kalender")`) — die In-App-Meldung bleibt davon
  unberührt.
"""

from django.conf import settings
from django.utils import timezone

from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

T = TypeNotification


def sprache(user) -> str:
    return user.langue_preferee if getattr(user, "langue_preferee", "") == "fr" else "de"


def wann(dt) -> str:
    return timezone.localtime(dt).strftime("%d.%m.%Y %H:%M")


def datum(d) -> str:
    return d.strftime("%d.%m.%Y")


def name_von(user) -> str:
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}".strip() or user.email
    return user.email


def mail_aktiv() -> bool:
    return email_module_actif("kalender")


def melden(user, typ, de, fr, *, lien="/kalender", mail=False) -> None:
    """In-App-Meldung (und optional E-Mail) an `user`. `de`/`fr` = (Titel, Nachricht)."""
    if user is None:
        return
    titel, text = fr if sprache(user) == "fr" else de
    notifier(user, typ, titre=titel, message=text, lien=lien)
    if mail:
        _mail(user, de, fr, lien)


def _mail(user, de, fr, lien) -> None:
    if not user.email or not mail_aktiv():
        return
    textes = {"de": Texte(titre=de[0], paragraphes=[de[1]], cta="Zum Kalender")}
    if sprache(user) == "fr":
        textes["fr"] = Texte(titre=fr[0], paragraphes=[fr[1]], cta="Ouvrir le calendrier")
    envoyer_email_cid(
        sujet=de[0] if sprache(user) == "de" else fr[0],
        destinataire=user.email,
        textes=textes,
        lien=f"{settings.FRONTEND_URL.rstrip('/')}{lien}",
        fail_silently=True,
    )


def termin_empfaenger(termin, ausser=None) -> list:
    """Eingeladene (ohne Absagen), Ersteller und eingetragene Helfer der Dienste des Termins."""
    from .models import Antwort, DienstEintragung

    nutzer = {termin.erstellt_von}
    for e in termin.einladungen.exclude(antwort=Antwort.ABSAGE).select_related("user"):
        nutzer.add(e.user)
    for e in DienstEintragung.objects.filter(dienst__termin=termin).select_related("user"):
        nutzer.add(e.user)
    return [u for u in nutzer if u.is_active and (ausser is None or u.pk != ausser.pk)]

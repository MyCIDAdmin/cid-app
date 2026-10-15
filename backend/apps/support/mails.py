"""Meldungen des Supports — In-App-Meldung (Sprache des Empfängers) und zweisprachige Mail.

Die Mail nennt nur Ticketnummer und Betreff, nie den Text der Nachricht ; den liest man in der
App. Versandfehler stören die Aktion nicht.
"""

from apps.kalender.benachrichtigung import sprache
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from . import services

CTA = ("Zum Ticket", "Vers le ticket")


def _sende_mail(user, de, fr, *, lien, details) -> None:
    if not getattr(user, "email", ""):
        return
    details_de, details_fr = details
    textes = {
        "de": Texte(titre=de[0], paragraphes=[de[1]], details=details_de, cta=CTA[0]),
        "fr": Texte(titre=fr[0], paragraphes=[fr[1]], details=details_fr, cta=CTA[1]),
    }
    envoyer_email_cid(
        sujet=f"{de[0]} · {fr[0]}",
        destinataire=user.email,
        textes=textes,
        lien=lien,
        fail_silently=True,
    )


def _melde(user, typ, de, fr, *, lien, details) -> None:
    if user is None or not user.is_active:
        return
    titel, text = fr if sprache(user) == "fr" else de
    notifier(user, typ, titre=titel, message=text, lien=lien)
    _sende_mail(user, de, fr, lien=lien, details=details)


def _details(ticket):
    return (
        [("Ticket", f"#{ticket.pk}"), ("Betreff", ticket.betreff)],
        [("Ticket", f"#{ticket.pk}"), ("Objet", ticket.betreff)],
    )


def lien_fuer(ticket) -> str:
    return f"/support?ticket={ticket.pk}"


def buero_neues_ticket(ticket, *, antwort: bool = False) -> None:
    """Neues Ticket (oder neue Antwort der Person) an die zuständige Stelle im Büro."""
    empfaenger = [ticket.bearbeiter] if antwort and ticket.bearbeiter else None
    if empfaenger is None or not empfaenger[0].is_active:
        empfaenger = services.buero_nutzer(ausser=ticket.user_id)
    wer = ticket.name or "—"
    if antwort:
        de = (f"Neue Antwort im Ticket #{ticket.pk}", f"{wer} hat im Ticket geantwortet.")
        fr = (f"Nouvelle réponse au ticket #{ticket.pk}", f"{wer} a répondu au ticket.")
    else:
        de = (f"Neues Support-Ticket #{ticket.pk}", f"{wer} hat ein Ticket eröffnet.")
        fr = (f"Nouveau ticket #{ticket.pk}", f"{wer} a ouvert un ticket.")
    for nutzer in empfaenger:
        _melde(
            nutzer,
            TypeNotification.SUPPORT_TICKET_NEU,
            de,
            fr,
            lien=lien_fuer(ticket),
            details=_details(ticket),
        )


def person_antwort(ticket) -> None:
    de = (
        f"Antwort auf dein Ticket #{ticket.pk}",
        "Das Büro hat dir geantwortet. Du findest die Antwort im Bereich Support der App.",
    )
    fr = (
        f"Réponse à ton ticket #{ticket.pk}",
        "Le bureau t'a répondu. Tu trouveras la réponse dans la section Support de l'application.",
    )
    _melde(
        ticket.user,
        TypeNotification.SUPPORT_ANTWORT,
        de,
        fr,
        lien=lien_fuer(ticket),
        details=_details(ticket),
    )


def person_status(ticket) -> None:
    if ticket.status == "geloest":
        de = (f"Ticket #{ticket.pk} ist gelöst", "Das Büro hat dein Ticket als gelöst markiert.")
        fr = (f"Ticket #{ticket.pk} résolu", "Le bureau a marqué ton ticket comme résolu.")
    else:
        de = (f"Ticket #{ticket.pk} geschlossen", "Das Büro hat dein Ticket geschlossen.")
        fr = (f"Ticket #{ticket.pk} clos", "Le bureau a clos ton ticket.")
    _melde(
        ticket.user,
        TypeNotification.SUPPORT_STATUS,
        de,
        fr,
        lien=lien_fuer(ticket),
        details=_details(ticket),
    )

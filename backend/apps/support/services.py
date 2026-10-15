"""Support — Rechte und Empfänger."""

from datetime import timedelta

from django.utils import timezone

from apps.rbac import services as rbac
from apps.rbac.models import NiveauAcces

from .models import AKTIVE_STATI, Ticket

SEITE = "page_support"
MAX_TICKETS_PRO_STUNDE = 5
MAX_OFFENE_TICKETS = 10


def darf_verwalten(user) -> bool:
    """Büro (Seite „Support“ mit Schreibrecht) und App Admin : Tickets bearbeiten, FAQ pflegen."""
    return rbac.has_admin_page_access(user, SEITE, NiveauAcces.LECTURE_ECRITURE)


def zu_viele_tickets(user) -> str | None:
    """Schutz vor Missbrauch : Grund (Fehlercode) oder None."""
    eigene = Ticket.objects.filter(user=user)
    if eigene.filter(created_at__gte=timezone.now() - timedelta(hours=1)).count() >= (
        MAX_TICKETS_PRO_STUNDE
    ):
        return "zu_viele_tickets"
    if eigene.filter(status__in=AKTIVE_STATI).count() >= MAX_OFFENE_TICKETS:
        return "zu_viele_offene_tickets"
    return None


def buero_nutzer(ausser=None):
    """Aktive Konten, die den Support bearbeiten dürfen (Empfänger neuer Tickets)."""
    from apps.accounts.models import ROLE_LEVELS, Role, User

    stufe = ROLE_LEVELS[Role.BUREAU_ADMIN]
    rollen = [r for r, n in ROLE_LEVELS.items() if n >= stufe]
    kandidaten = User.objects.filter(role__in=rollen, is_active=True).exclude(pk=ausser)
    return [u for u in kandidaten if darf_verwalten(u)]


def anzeigename(user) -> str:
    if user is None:
        return ""
    person = getattr(user, "membre", None) or getattr(user, "fan_profil", None)
    if person is not None:
        return f"{person.prenom} {person.nom}".strip()
    return user.email


def art_der_person(user) -> str:
    if user is None:
        return ""
    if getattr(user, "membre", None) is not None:
        return "mitglied"
    if getattr(user, "fan_profil", None) is not None:
        return "fan"
    return "konto"

"""„Hilfe gesucht“ (Nov. 2026): Gesuche ohne Projektbezug, mit Empfehlung durch die Ersteller·in und
Genehmigung durch eine berechtigte Person (z. B. Büro).

Rechte (Seiten der Rollenverwaltung, Startwerte siehe rbac-Migration 0014):
  page_hilfe_veroeffentlichen  Gesuche anlegen (Standard ab Rolle RH, einzeln freigebbar)
  page_hilfe_genehmigen        Meldungen verbindlich annehmen oder ablehnen, alle Gesuche pflegen
Die Ersteller·in pflegt und empfiehlt ihre eigenen Gesuche immer, auch ohne die Seiten."""

from __future__ import annotations

from datetime import date

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from django.utils import timezone

from apps.rbac.models import NiveauAcces, RoleModulePermission
from apps.rbac.services import has_admin_page_access

SEITE_VEROEFFENTLICHEN = "page_hilfe_veroeffentlichen"
SEITE_GENEHMIGEN = "page_hilfe_genehmigen"


def _angemeldet(user) -> bool:
    return bool(user is not None and getattr(user, "is_authenticated", False))


def darf_genehmigen(user) -> bool:
    return _angemeldet(user) and has_admin_page_access(
        user, SEITE_GENEHMIGEN, required=NiveauAcces.LECTURE_ECRITURE
    )


def darf_veroeffentlichen(user) -> bool:
    if not _angemeldet(user):
        return False
    return darf_genehmigen(user) or has_admin_page_access(
        user, SEITE_VEROEFFENTLICHEN, required=NiveauAcces.LECTURE_ECRITURE
    )


def ist_ersteller(user, stelle) -> bool:
    membre = getattr(user, "membre", None) if _angemeldet(user) else None
    return membre is not None and stelle.created_by_id == membre.id


def darf_frei_pflegen(user, stelle) -> bool:
    """Freies Gesuch ändern, schließen, löschen, Meldungen empfehlen."""
    return darf_genehmigen(user) or ist_ersteller(user, stelle)


def genehmiger_nutzer(ausser=None) -> list:
    """Aktive Konten mit Schreibrecht auf der Seite „Meldungen genehmigen“ (Empfänger neuer
    Empfehlungen). Der App Admin hat die Seite immer."""
    from apps.accounts.models import Role, User

    rollen = set(
        RoleModulePermission.objects.filter(
            module=SEITE_GENEHMIGEN,
            niveau_acces=NiveauAcces.LECTURE_ECRITURE,
            role__actif=True,
        ).values_list("role__slug", flat=True)
    )
    rollen.add(Role.SUPER_ADMIN)
    kandidaten = (
        User.objects.filter(is_active=True)
        .filter(Q(role__in=rollen) | Q(role_assignments__role__slug__in=rollen))
        .exclude(pk=ausser)
        .distinct()
    )
    return list(kandidaten)


def schliesse_abgelaufene(heute: date | None = None) -> int:
    """Gesuche mit abgelaufener Bewerbungsfrist (oder vergangenem Termin bei einmaliger Hilfe)
    werden geschlossen. Gesuche, deren Plätze alle vergeben sind, stehen schon auf „besetzt“."""
    from .models import ArtStelle, ProjetStelle, StatutStelle

    heute = heute or timezone.localdate()
    offen = ProjetStelle.objects.filter(status=StatutStelle.OFFEN, projet__isnull=True)
    ablauf = Q(frist__lt=heute) | Q(art=ArtStelle.EINMALIG, frist__isnull=True, termin__lt=heute)
    return offen.filter(ablauf).update(status=StatutStelle.GESCHLOSSEN, updated_at=timezone.now())


def sende_mail(membre, betreff: str, text: str) -> None:
    """Kurze Mail an das Konto der Person (läuft nie als Fehler in die Aktion hinein)."""
    user = getattr(membre, "user", None)
    if user is None or not user.email:
        return
    try:
        send_mail(
            subject=betreff,
            message=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    except Exception:  # noqa: BLE001 — Benachrichtigung ist nie Teil der Fachaktion
        import logging

        logging.getLogger(__name__).exception("Hilfe-gesucht-Mail nicht gesendet")

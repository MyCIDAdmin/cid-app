"""Zugriffsregeln der Umfragen."""

from apps.membres.models import StatutMembre
from apps.rbac.models import NiveauAcces
from apps.rbac.services import has_admin_page_access

from .models import ErgebnisModus, Zielgruppe


def ist_aktives_mitglied(user) -> bool:
    membre = getattr(user, "membre", None) if user is not None else None
    return membre is not None and membre.statut == StatutMembre.ACTIF


def ist_verwaltung(user, schreiben: bool = False) -> bool:
    if user is None or not user.is_authenticated:
        return False
    niveau = NiveauAcces.LECTURE_ECRITURE if schreiben else NiveauAcces.LECTURE
    return has_admin_page_access(user, "page_quiz", required=niveau)


def darf_teilnehmen(user, umfrage) -> bool:
    if user is None or not user.is_authenticated:
        return False
    if umfrage.zielgruppe == Zielgruppe.KONTEN:
        return True
    return ist_aktives_mitglied(user)


def kann_ergebnisse_sehen(user, umfrage, teilgenommen: bool) -> bool:
    if user is None:
        return False
    if ist_verwaltung(user):
        return True
    if not teilgenommen:
        return False
    if umfrage.ergebnis_modus == ErgebnisModus.LIVE:
        return True
    return umfrage.ergebnis_modus == ErgebnisModus.NACH_FRIST and umfrage.abgelaufen

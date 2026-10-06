"""Aktivitätsprotokoll der Projekte (2026-10-07) — ein einziger Einstiegspunkt, den die Views
aufrufen. Protokollieren darf nie eine Aktion scheitern lassen: Fehler werden verschluckt und
geloggt (Protokoll ist Komfort/Nachvollziehbarkeit, kein Teil der fachlichen Transaktion)."""

import logging

from .models import ProjetAktivitaet

logger = logging.getLogger(__name__)


def _akteur(user):
    membre = getattr(user, "membre", None) if user is not None else None
    if membre is not None:
        return membre, f"{membre.prenom} {membre.nom}".strip()
    return None, getattr(user, "email", "") or ""


def logge(user, projet, aktion, objekt="", detail=""):
    try:
        membre, name = _akteur(user)
        return ProjetAktivitaet.objects.create(
            projet=projet,
            akteur=membre,
            akteur_name=name[:200],
            aktion=aktion,
            objekt=str(objekt)[:200],
            detail=str(detail)[:200],
        )
    except Exception:  # noqa: BLE001 — siehe Modul-Docstring
        logger.exception("Projekt-Aktivität konnte nicht protokolliert werden (%s)", aktion)
        return None

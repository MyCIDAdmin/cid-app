"""Hilfsfunktionen — Protokoll, Jahressperre, Änderungs-Diff."""

from datetime import date
from decimal import Decimal

from rest_framework.exceptions import APIException

from .models import FinanzProtokoll, Jahresabschluss


class JahrGesperrt(APIException):
    status_code = 409
    default_detail = "Dieses Geschäftsjahr ist abgeschlossen und gesperrt."
    default_code = "jahr_gesperrt"


def jahr_gesperrt(annee: int) -> bool:
    return Jahresabschluss.objects.filter(annee=annee, aktiv=True).exists()


def pruefe_jahr(annee: int) -> None:
    if jahr_gesperrt(annee):
        raise JahrGesperrt(f"Das Geschäftsjahr {annee} ist abgeschlossen und gesperrt.")


def nom_utilisateur(user) -> str:
    if user is None:
        return ""
    membre = getattr(user, "membre", None)
    if membre is not None:
        return f"{membre.prenom} {membre.nom}"
    return user.email


def _wert(valeur):
    if isinstance(valeur, (Decimal, date)):
        return str(valeur)
    return valeur


def etat_depense(depense) -> dict:
    """Felder, die im Protokoll verglichen werden."""
    return {
        "date_depense": _wert(depense.date_depense),
        "montant": _wert(depense.montant),
        "categorie": depense.categorie.nom,
        "fournisseur": depense.fournisseur,
        "description": depense.description,
        "evenement": depense.evenement.titre if depense.evenement else "",
        "projet": depense.projet.titre if depense.projet else "",
        "justificatif": bool(depense.justificatif),
    }


def diff(avant: dict, apres: dict) -> dict:
    return {k: [avant[k], apres[k]] for k in apres if avant.get(k) != apres[k]}


def resume_depense(depense) -> str:
    return f"{depense.date_depense} · {depense.fournisseur} · {depense.montant} €"[:300]


def protokolliere(
    user, aktion, objekt_typ, objekt_id, zusammenfassung, annee=None, aenderungen=None
):
    return FinanzProtokoll.objects.create(
        benutzer=user,
        benutzer_name=nom_utilisateur(user),
        aktion=aktion,
        objekt_typ=objekt_typ,
        objekt_id=str(objekt_id or ""),
        annee=annee,
        zusammenfassung=zusammenfassung[:300],
        aenderungen=aenderungen or {},
    )

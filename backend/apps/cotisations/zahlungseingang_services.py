"""Buchung eines importierten Zahlungseingangs ins Zahlungsregister (Release 3, 2026-10-12).

Gemeinsamer Weg für den Excel-Import (automatische Buchung vollständiger Zeilen) und die
manuelle Buchung in der Oberfläche. Es entsteht eine BEZAHLTE `Cotisation` — ohne Benachrichtigung
an das Mitglied und ohne Änderung des Mitgliedsstatus (importierte Zahlungen sind Nachträge)."""

import datetime

from django.db import transaction

from .models import (
    Cotisation,
    ModePaiement,
    StatutCotisation,
    StatutZahlungseingang,
    TypeArticle,
    Zahlungseingang,
)

#: Artikeltypen, die ein Zahlungseingang annehmen darf (Entscheidung Release 3).
ARTIKEL_ERLAUBT = (
    TypeArticle.COTISATION,
    TypeArticle.ADHESION,
    TypeArticle.DON,
    TypeArticle.AUTRE_LIBRE,
)

_STANDARD_LIBELLE = {
    TypeArticle.COTISATION: "Mitgliedsbeitrag",
    TypeArticle.ADHESION: "Aufnahmegebühr",
    TypeArticle.DON: "Spende",
    TypeArticle.AUTRE_LIBRE: "Sonstige Zahlung",
}


def fehlende_angaben(eingang: Zahlungseingang) -> list[str]:
    """Was fehlt noch, damit der Eingang gebucht werden kann (leer = buchbar)."""
    fehlt = []
    if eingang.membre_id is None:
        fehlt.append("Mitglied")
    if eingang.type_article not in ARTIKEL_ERLAUBT:
        fehlt.append("Artikel")
    return fehlt


def standard_libelle(type_article: str, annee) -> str:
    text = _STANDARD_LIBELLE.get(type_article, "Zahlung")
    if type_article == TypeArticle.COTISATION and annee:
        return f"{text} {annee}"
    return text


@transaction.atomic
def buchen(eingang: Zahlungseingang, gebucht_von) -> Cotisation:
    """Legt die bezahlte Cotisation an und markiert den Eingang als gebucht. ValueError, wenn
    der Eingang nicht offen oder unvollständig ist."""
    eingang = Zahlungseingang.objects.select_for_update().get(pk=eingang.pk)
    if eingang.status != StatutZahlungseingang.OFFEN:
        raise ValueError("Nur offene Zahlungseingänge können gebucht werden.")
    fehlt = fehlende_angaben(eingang)
    if fehlt:
        raise ValueError("Es fehlt noch: " + ", ".join(fehlt))

    annee = None
    if eingang.type_article == TypeArticle.COTISATION:
        annee = eingang.annee or eingang.datum.year
    referenz = eingang.referenz or None
    if referenz and Cotisation.objects.filter(reference_transaction=referenz).exists():
        raise ValueError("Diese Referenz ist im Zahlungsregister bereits vorhanden.")

    zeitpunkt = datetime.datetime.combine(
        eingang.datum, datetime.time(12, 0), tzinfo=datetime.timezone.utc
    )
    cotisation = Cotisation(
        membre_id=eingang.membre_id,
        type_article=eingang.type_article,
        libelle=(eingang.libelle or standard_libelle(eingang.type_article, annee))[:200],
        montant=eingang.betrag,
        mode_paiement=eingang.mode_paiement or ModePaiement.VIREMENT_SEPA,
        statut=StatutCotisation.PAYEE,
        reference_transaction=referenz,
        annee=annee,
        saisie_par=gebucht_von,
        date_paiement=zeitpunkt,
    )
    cotisation.save()

    eingang.cotisation = cotisation
    eingang.status = StatutZahlungseingang.GEBUCHT
    eingang.hinweis = ""
    eingang.save(update_fields=["cotisation", "status", "hinweis", "updated_at"])
    return cotisation

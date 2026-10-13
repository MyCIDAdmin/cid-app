"""Fähigkeiten-Datenbank (Release 9) — Standardkatalog und Bericht „Wer kann wo helfen?“."""

import re

from django.db.models import Q

from .models import Faehigkeit, FaehigkeitKategorie, MembreFaehigkeit

STANDARD_KATALOG = {
    FaehigkeitKategorie.IT_WEB: [
        "Webdesign",
        "Webentwicklung",
        "App-Entwicklung",
        "IT-Support",
        "Datenanalyse",
        "IT-Sicherheit & Datenschutz",
    ],
    FaehigkeitKategorie.MEDIEN: [
        "Fotografie",
        "Video & Schnitt",
        "Grafikdesign",
        "Social Media",
        "Texte & Redaktion",
        "Pressearbeit",
        "Moderation",
    ],
    FaehigkeitKategorie.ORGANISATION: [
        "Projektmanagement",
        "Eventorganisation",
        "Logistik",
        "Einkauf & Beschaffung",
        "Fundraising & Sponsoring",
        "Marketing",
        "Freiwilligenkoordination",
    ],
    FaehigkeitKategorie.FINANZEN_RECHT: [
        "Buchhaltung",
        "Steuern",
        "Recht",
        "Versicherungen",
        "Verwaltung",
    ],
    FaehigkeitKategorie.SPRACHEN: [
        "Übersetzen Deutsch–Französisch",
        "Übersetzen Deutsch–Arabisch",
        "Übersetzen Englisch",
        "Dolmetschen",
    ],
    FaehigkeitKategorie.SPORT_EVENTS: [
        "Training & Coaching",
        "Schiedsrichter",
        "Fahrdienst & Transport",
        "Catering & Kochen",
        "Auf- und Abbau",
        "Musik & DJ",
    ],
    FaehigkeitKategorie.HANDWERK_TECHNIK: [
        "Handwerk",
        "Elektrotechnik",
        "Ton- & Bühnentechnik",
        "Druck & Beschriftung",
    ],
    FaehigkeitKategorie.SOZIALES: [
        "Betreuung & Beratung",
        "Nachhilfe",
        "Erste Hilfe",
        "Jugendarbeit",
    ],
}


def normalisiere_bezeichnung(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def bericht(params):
    """Fähigkeiten mit den Mitgliedern, die dabei helfen können. Filter : `faehigkeit` (IDs,
    kommagetrennt), `kategorie`, `statut` (Mitgliedsstatus), `q` (Fähigkeit, Name, Anmerkung),
    `alle=1` (auch Fähigkeiten ohne Mitglieder). Sortiert nach Kategorie, dann Anzahl."""
    zeilen = MembreFaehigkeit.objects.select_related("membre", "faehigkeit")
    if params.get("statut"):
        zeilen = zeilen.filter(membre__statut=params["statut"])
    ids = [i for i in (params.get("faehigkeit") or "").split(",") if i.strip()]
    if ids:
        zeilen = zeilen.filter(faehigkeit_id__in=ids)
    if params.get("kategorie"):
        zeilen = zeilen.filter(faehigkeit__kategorie=params["kategorie"])
    q = (params.get("q") or "").strip()
    if q:
        zeilen = zeilen.filter(
            Q(faehigkeit__bezeichnung__icontains=q)
            | Q(membre__nom__icontains=q)
            | Q(membre__prenom__icontains=q)
            | Q(kommentar__icontains=q)
        )
    je_faehigkeit: dict = {}
    for z in zeilen.order_by("membre__nom", "membre__prenom"):
        je_faehigkeit.setdefault(z.faehigkeit_id, []).append(z)

    katalog = Faehigkeit.objects.all()
    if ids:
        katalog = katalog.filter(id__in=ids)
    if params.get("kategorie"):
        katalog = katalog.filter(kategorie=params["kategorie"])
    alle = params.get("alle") == "1" and not q and not params.get("statut")
    ergebnis = []
    for f in katalog:
        eintraege = je_faehigkeit.get(f.id, [])
        if not eintraege and not alle:
            continue
        ergebnis.append(
            {
                "id": str(f.id),
                "bezeichnung": f.bezeichnung,
                "kategorie": f.kategorie,
                "ist_standard": f.ist_standard,
                "anzahl": len(eintraege),
                "mitglieder": [
                    {
                        "id": str(z.membre_id),
                        "nom_complet": f"{z.membre.prenom} {z.membre.nom}",
                        "numero_membre": z.membre.numero_membre,
                        "email": z.membre.email,
                        "ville": z.membre.ville_de,
                        "statut": z.membre.statut,
                        "kommentar": z.kommentar,
                    }
                    for z in eintraege
                ],
            }
        )
    ergebnis.sort(key=lambda e: (e["kategorie"], -e["anzahl"], e["bezeichnung"].lower()))
    mitglieder = {m["id"] for e in ergebnis for m in e["mitglieder"]}
    return {
        "summen": {
            "faehigkeiten": sum(1 for e in ergebnis if e["anzahl"]),
            "mitglieder": len(mitglieder),
            "zuordnungen": sum(e["anzahl"] for e in ergebnis),
        },
        "ergebnisse": ergebnis,
    }

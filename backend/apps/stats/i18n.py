"""Sprachauswahl und Übersetzungen für die Statistik-Exporte (PDF, Excel, CSV) — Nutzerwunsch
2026-10-06 : "Berichte sollen auf Deutsch sein". Die Oberfläche übergibt ihre Sprache als
Abfrageparameter `langue` (de/fr) ; ohne gültigen Parameter wird Deutsch verwendet (nicht die
gespeicherte Nutzersprache, deren Standardwert Französisch ist und die Berichte bisher
französisch machte). Rohwerte aus der Datenbank (Status, Typen, Kategorienamen) werden hier in
Anzeigetexte übersetzt."""

LANGUEN = ("de", "fr")
STANDARD = "de"


def langue_aus_anfrage(request) -> str:
    wert = request.query_params.get("langue")
    return wert if wert in LANGUEN else STANDARD


TYP = {
    "de": {
        "cotisation": "Mitgliedsbeitrag",
        "don": "Spende",
        "adhesion": "Mitgliedschaft",
        "evenement": "Veranstaltung",
        "boutique": "Shop",
        "autre": "Sonstiges",
        "projet": "Projekt",
        "depense": "Ausgabe",
    },
    "fr": {
        "cotisation": "Cotisation",
        "don": "Don",
        "adhesion": "Adhésion",
        "evenement": "Événement",
        "boutique": "Boutique",
        "autre": "Autre",
        "projet": "Projet",
        "depense": "Dépense",
    },
}

STATUS = {
    "de": {
        "en_attente": "Ausstehend",
        "payee": "Bezahlt",
        "echouee": "Fehlgeschlagen",
        "remboursee": "Erstattet",
        "annulee": "Storniert",
        "brouillon": "Entwurf",
        "en_attente_justificatif": "Warten auf Nachweis",
        "en_attente_paiement": "Warten auf Zahlung",
        "rabais_refuse": "Ermäßigung abgelehnt",
        "expiree": "Abgelaufen",
        "confirmee": "Bestätigt",
        "en_preparation": "In Vorbereitung",
        "expediee": "Versendet",
        "livree": "Geliefert",
        "approuvee": "Genehmigt",
        "rejetee": "Abgelehnt",
        "en_cours": "Laufend",
        "termine": "Abgeschlossen",
        "annule": "Abgesagt",
    },
    "fr": {
        "en_attente": "En attente",
        "payee": "Payée",
        "echouee": "Échouée",
        "remboursee": "Remboursée",
        "annulee": "Annulée",
        "brouillon": "Brouillon",
        "en_attente_justificatif": "En attente de justificatif",
        "en_attente_paiement": "En attente de paiement",
        "rabais_refuse": "Rabais refusé",
        "expiree": "Expirée",
        "confirmee": "Confirmée",
        "en_preparation": "En préparation",
        "expediee": "Expédiée",
        "livree": "Livrée",
        "approuvee": "Approuvée",
        "rejetee": "Rejetée",
        "en_cours": "En cours",
        "termine": "Terminé",
        "annule": "Annulé",
    },
}

EVENT_TYP = {
    "de": {
        "deplacement": "Auswärtsfahrt",
        "fete": "Fest / Treffen",
        "conference": "AMA / Konferenz",
        "tournoi": "Turnier",
        "ag": "Mitgliederversammlung",
    },
    "fr": {
        "deplacement": "Déplacement",
        "fete": "Fête / Rassemblement",
        "conference": "AMA / Conférence",
        "tournoi": "Tournoi",
        "ag": "Assemblée Générale",
    },
}


def _schlag(tabelle, schluessel, langue):
    return tabelle.get(langue, tabelle[STANDARD]).get(schluessel, schluessel)


def typ(schluessel, langue):
    return _schlag(TYP, schluessel, langue)


def status(schluessel, langue):
    return _schlag(STATUS, schluessel, langue)


def event_typ(schluessel, langue):
    return _schlag(EVENT_TYP, schluessel, langue)


def kategorie(namen, fallback, langue):
    """Kategoriename in der Sprache des Berichts (Rückfall auf den gespeicherten Namen)."""
    return (namen or {}).get(langue) or fallback

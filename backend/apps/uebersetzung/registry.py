"""Welche Modelle/Felder automatisch übersetzt werden ("app_label.modellname" -> Felder)."""

UEBERSETZBAR = {
    "projets.projet": ["titre", "description_html"],
    "evenements.evenement": ["titre", "description"],
    "boutique.produit": ["nom", "description"],
    "adhesions.campagneadhesion": ["nom", "description"],
    "adhesions.offreadhesion": ["nom", "description"],
    "communaute.album": ["nom", "description"],
    "umfragen.umfrage": ["titel", "beschreibung"],
    "umfragen.umfragefrage": ["text", "thema"],
    "umfragen.umfrageoption": ["text"],
    "kalender.termin": ["titel", "beschreibung", "ort"],
}

# Felder mit HTML-Inhalt (DeepL erhält die Tags, übersetzt nur den Text).
HTML_FELDER = {"description_html"}


def schluessel(obj_oder_modell) -> str:
    meta = obj_oder_modell._meta
    return f"{meta.app_label}.{meta.model_name}"

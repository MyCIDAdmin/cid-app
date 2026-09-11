"""
Génération du reçu PDF de paiement — app cotisations (RICEFW R-010, W-002, AHM-17).

Un seul gabarit HTML (templates/cotisations/receipt_pdf.html) rendu via WeasyPrint, dans la
langue de préférence du membre (accounts.User.langue_preferee). Portée volontairement limitée
à FR/DE pour cette itération : l'arabe est explicitement rattaché à la Release 2 dans le
paramétrage i18n du projet (voir le commentaire au-dessus de LANGUAGES dans
config/settings/base.py — "FR (défaut) / DE / AR (R2)" — et Project Timeline v1.2 Phase 5
"i18n arabe RTL complet"). Un membre préférant l'arabe reçoit donc le reçu en français
(fallback) plutôt qu'un gabarit RTL non abouti ; à revisiter en Phase 5.

Aucune TVA n'est appliquée (association à but non lucratif, non assujettie) — la ligne
"TVA (0%)" est affichée pour rester cohérente avec le stepper de paiement du mockup
(#pg-cotisation, receipt-row "TVA (0 %)").
"""

import base64
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from .models import Cotisation, ModePaiement

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"

_MOIS_FR = [
    "",
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
]
_MOIS_DE = [
    "",
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
]

TRADUCTIONS = {
    "fr": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Supporters en Allemagne",
        "title": "Reçu de paiement",
        "subtitle": "Ce document atteste du paiement décrit ci-dessous.",
        "reference": "Référence",
        "date_paiement": "Date de paiement",
        "membre": "Membre",
        "numero_membre": "N° membre",
        "mode_paiement": "Mode de paiement",
        "article": "Article",
        "montant": "Montant",
        "montant_ht": "Montant HT",
        "tva": "TVA (0 %)",
        "total": "Total payé",
        "paid_stamp": "Payé",
        "footer_note": (
            "Reçu généré automatiquement — aucune signature n'est requise pour sa validité. "
            "Merci de le conserver pour vos archives personnelles."
        ),
        "footer_page": "Clubistes in Deutschland — Reçu de paiement",
        "modes_paiement": {
            ModePaiement.CARTE: "Carte bancaire",
            ModePaiement.VIREMENT_SEPA: "Virement SEPA",
            ModePaiement.PAYPAL: "PayPal",
        },
    },
    "de": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Anhänger in Deutschland",
        "title": "Zahlungsbeleg",
        "subtitle": "Dieses Dokument bestätigt die unten beschriebene Zahlung.",
        "reference": "Referenz",
        "date_paiement": "Zahlungsdatum",
        "membre": "Mitglied",
        "numero_membre": "Mitgliedsnr.",
        "mode_paiement": "Zahlungsart",
        "article": "Artikel",
        "montant": "Betrag",
        "montant_ht": "Nettobetrag",
        "tva": "MwSt. (0 %)",
        "total": "Bezahlter Betrag",
        "paid_stamp": "Bezahlt",
        "footer_note": (
            "Automatisch erstellter Beleg — für die Gültigkeit ist keine Unterschrift "
            "erforderlich. Bitte für Ihre Unterlagen aufbewahren."
        ),
        "footer_page": "Clubistes in Deutschland — Zahlungsbeleg",
        "modes_paiement": {
            ModePaiement.CARTE: "Kreditkarte",
            ModePaiement.VIREMENT_SEPA: "SEPA-Überweisung",
            ModePaiement.PAYPAL: "PayPal",
        },
    },
}


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Logo CID encodé en base64 — évite toute dépendance à STATIC_URL pour WeasyPrint."""
    contenu = (_ASSETS_DIR / "logo_cid.jpg").read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(contenu).decode('ascii')}"


def _formate_montant(montant, langue: str) -> str:
    # Format européen "1 234,56 €" (FR) / "1.234,56 €" (DE) — les montants de l'association
    # restent < 10 000 € en pratique, une virgule décimale simple suffit pour ce MVP.
    # Cotisation.montant revient toujours en Decimal depuis la BDD (psycopg) ; le cast explicite
    # ci-dessous protège seulement contre une valeur assignée en mémoire sans passer par la BDD
    # (ex. un objet construit directement en test, avant tout rafraîchissement).
    montant = Decimal(str(montant))
    valeur = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return f"{valeur} €"


def _formate_date(date_paiement, langue: str) -> str:
    mois = _MOIS_DE if langue == "de" else _MOIS_FR
    date_locale = (
        timezone.localtime(date_paiement) if timezone.is_aware(date_paiement) else date_paiement
    )
    return f"{date_locale.day} {mois[date_locale.month]} {date_locale.year}"


def _resoudre_langue(user) -> str:
    """
    Langue du reçu — accounts.User.langue_preferee, avec repli sur "fr" pour un membre sans
    compte lié (fiche importée, voir Membre.user) ou préférant l'arabe (voir docstring module).
    Extrait en fonction séparée pour rester testable sans avoir à parser le PDF généré.
    """
    return user.langue_preferee if user and user.langue_preferee in TRADUCTIONS else "fr"


def generate_receipt_pdf(cotisation: Cotisation) -> bytes:
    """
    Génère le reçu PDF d'une cotisation payée. L'appelant (views.py) garantit que
    cotisation.statut == StatutCotisation.PAYEE et que date_paiement/reference_transaction sont
    renseignés (voir Cotisation.save) — pas de re-vérification ici, cette fonction est un pur
    rendu.
    """
    langue = _resoudre_langue(cotisation.membre.user)
    t = TRADUCTIONS[langue]

    mode_paiement_affiche = t["modes_paiement"].get(
        cotisation.mode_paiement, cotisation.mode_paiement
    )

    contexte = {
        "cotisation": cotisation,
        "langue": langue,
        "t": t,
        "logo_data_uri": _logo_data_uri(),
        "membre_nom_complet": f"{cotisation.membre.prenom} {cotisation.membre.nom}",
        "mode_paiement_affiche": mode_paiement_affiche,
        "montant_formate": _formate_montant(cotisation.montant, langue),
        "tva_formatee": _formate_montant(Decimal("0.00"), langue),
        "date_paiement_formatee": _formate_date(cotisation.date_paiement, langue),
    }

    html = render_to_string("cotisations/receipt_pdf.html", contexte)
    return HTML(string=html).write_pdf()

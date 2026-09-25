"""
Génération des documents PDF de commande — app boutique (demande utilisateur du 2026-09-25,
module "Shop-Verwaltung" : "Bestellungsbestätigungsdokument... als Spalte" / "Rechnung nach
Bezahlung... als Spalte"). Même principe que apps.cotisations.pdf (reçu de cotisation) : un seul
gabarit HTML (templates/boutique/commande_pdf.html) rendu via WeasyPrint, dans la langue de
préférence du membre, portée FR/DE (l'arabe reste Phase 5 — voir la docstring de
apps.cotisations.pdf pour le raisonnement complet, identique ici).

Deux documents, un seul gabarit paramétré par `mode` :
  - "confirmation" (Bestellbestätigung) — disponible pour TOUTE commande dès sa création, quel
    que soit son statut de paiement (comme une confirmation de commande e-commerce classique) ;
    ne montre pas le tampon "Payé" ni le bloc mode de paiement tant qu'aucun paiement n'est
    confirmé.
  - "facture" (Rechnung) — seulement pour une commande dont le paiement a été confirmé
    (Commande.date_paiement_confirme renseignée) ; l'appelant (views.py) garantit cette condition
    avant d'appeler generate_facture_pdf, même répartition des responsabilités que
    CotisationViewSet.receipt/generate_receipt_pdf.

Aucune TVA n'est appliquée (association à but non lucratif, non assujettie) — même choix que
apps.cotisations.pdf, mais volontairement omis ici du tout (pas de ligne "TVA (0 %)") : la
demande utilisateur ne porte que sur "un document de confirmation" et "une facture", sans
référence au stepper de paiement du mockup qui justifiait cette ligne pour les cotisations.
"""

import base64
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

from .models import Commande, ModePaiementCommande

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
        "titles": {
            "confirmation": "Confirmation de commande",
            "facture": "Facture",
        },
        "subtitles": {
            "confirmation": "Ce document confirme la bonne réception de votre commande.",
            "facture": "Ce document atteste du paiement de la commande décrite ci-dessous.",
        },
        "reference": "N° de commande",
        "date_commande": "Date de commande",
        "destinataire": "Livraison à",
        "mode_paiement": "Mode de paiement",
        "date_paiement": "Date de paiement",
        "reference_paiement": "Référence de paiement",
        "article": "Article",
        "quantite": "Qté",
        "prix_unitaire": "Prix unitaire",
        "sous_total": "Sous-total",
        "montant_brut": "Montant brut",
        "bon_achat": "Bon d'achat déduit",
        "total": "Total",
        "paid_stamp": "Payé",
        "footer_note": (
            "Document généré automatiquement — aucune signature n'est requise pour sa validité. "
            "Merci de le conserver pour vos archives personnelles."
        ),
        "footer_page": "Clubistes in Deutschland — Boutique",
        "modes_paiement": {
            ModePaiementCommande.EN_LIGNE: "Paiement en ligne",
            ModePaiementCommande.VIREMENT: "Virement bancaire",
            ModePaiementCommande.ESPECES: "Espèces",
            ModePaiementCommande.BON_ACHAT: "Bon d'achat",
        },
    },
    "de": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Anhänger in Deutschland",
        "titles": {
            "confirmation": "Bestellbestätigung",
            "facture": "Rechnung",
        },
        "subtitles": {
            "confirmation": "Dieses Dokument bestätigt den Eingang Ihrer Bestellung.",
            "facture": "Dieses Dokument bestätigt die Zahlung der unten beschriebenen Bestellung.",
        },
        "reference": "Bestellnummer",
        "date_commande": "Bestelldatum",
        "destinataire": "Lieferung an",
        "mode_paiement": "Zahlungsart",
        "date_paiement": "Zahlungsdatum",
        "reference_paiement": "Zahlungsreferenz",
        "article": "Artikel",
        "quantite": "Menge",
        "prix_unitaire": "Einzelpreis",
        "sous_total": "Zwischensumme",
        "montant_brut": "Bruttobetrag",
        "bon_achat": "Abgezogener Gutschein",
        "total": "Gesamtbetrag",
        "paid_stamp": "Bezahlt",
        "footer_note": (
            "Automatisch erstelltes Dokument — für die Gültigkeit ist keine Unterschrift "
            "erforderlich. Bitte für Ihre Unterlagen aufbewahren."
        ),
        "footer_page": "Clubistes in Deutschland — Shop",
        "modes_paiement": {
            ModePaiementCommande.EN_LIGNE: "Online-Zahlung",
            ModePaiementCommande.VIREMENT: "Überweisung",
            ModePaiementCommande.ESPECES: "Barzahlung",
            ModePaiementCommande.BON_ACHAT: "Gutschein",
        },
    },
}


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Logo CID encodé en base64 — même raison que apps.cotisations.pdf._logo_data_uri (évite
    toute dépendance à STATIC_URL pour WeasyPrint). Copie locale de l'asset (apps/boutique/assets/
    logo_cid.jpg) plutôt qu'un import cross-app de la fonction privée de apps.cotisations.pdf :
    chaque app reste autonome pour ses propres PDF."""
    contenu = (_ASSETS_DIR / "logo_cid.jpg").read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(contenu).decode('ascii')}"


def _formate_montant(montant, langue: str) -> str:
    # Même format européen que apps.cotisations.pdf._formate_montant — voir sa docstring.
    montant = Decimal(str(montant))
    valeur = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return f"{valeur} €"


def _formate_date(date_valeur, langue: str) -> str:
    if date_valeur is None:
        return ""
    mois = _MOIS_DE if langue == "de" else _MOIS_FR
    date_locale = timezone.localtime(date_valeur) if timezone.is_aware(date_valeur) else date_valeur
    return f"{date_locale.day} {mois[date_locale.month]} {date_locale.year}"


def _resoudre_langue(user) -> str:
    """Même principe que apps.cotisations.pdf._resoudre_langue — voir sa docstring pour le
    raisonnement complet (portée FR/DE, l'arabe reste Phase 5)."""
    return user.langue_preferee if user and user.langue_preferee in TRADUCTIONS else "fr"


def _generer_pdf_commande(commande: Commande, *, mode: str) -> bytes:
    """Construit le PDF commun aux deux documents — `mode` ∈ {"confirmation", "facture"}, voir
    docstring de module. Pur rendu, aucune re-vérification de statut ici (responsabilité de
    l'appelant, voir views.py)."""
    langue = _resoudre_langue(commande.membre.user)
    t = TRADUCTIONS[langue]

    paye = commande.date_paiement_confirme is not None
    mode_paiement_affiche = (
        t["modes_paiement"].get(commande.mode_paiement, commande.mode_paiement)
        if commande.mode_paiement
        else ""
    )

    lignes = [
        {
            "libelle": str(ligne.variante),
            "quantite": ligne.quantite,
            "prix_unitaire_formate": _formate_montant(ligne.prix_unitaire, langue),
            "sous_total_net_formate": _formate_montant(ligne.sous_total_net, langue),
        }
        for ligne in commande.lignes.select_related("variante", "variante__produit").all()
    ]

    contexte = {
        "commande": commande,
        "langue": langue,
        "t": {**t, "title": t["titles"][mode], "subtitle": t["subtitles"][mode]},
        "mode": mode,
        "paye": paye,
        "logo_data_uri": _logo_data_uri(),
        "lignes": lignes,
        "mode_paiement_affiche": mode_paiement_affiche,
        "date_commande_formatee": _formate_date(commande.created_at, langue),
        "date_paiement_formatee": _formate_date(commande.date_paiement_confirme, langue),
        "montant_total_formate": _formate_montant(commande.montant_total, langue),
        "montant_bon_achat_formate": (
            _formate_montant(commande.montant_bon_achat, langue)
            if commande.montant_bon_achat > 0
            else ""
        ),
        "montant_du_formate": _formate_montant(commande.montant_du, langue),
    }

    html = render_to_string("boutique/commande_pdf.html", contexte)
    return HTML(string=html).write_pdf()


def generate_confirmation_pdf(commande: Commande) -> bytes:
    """Bestellbestätigung — disponible pour toute commande, voir docstring de module."""
    return _generer_pdf_commande(commande, mode="confirmation")


def generate_facture_pdf(commande: Commande) -> bytes:
    """Rechnung — l'appelant (CommandeViewSet.facture) garantit que
    commande.date_paiement_confirme est renseignée avant d'appeler cette fonction, même
    répartition que CotisationViewSet.receipt/generate_receipt_pdf (voir docstring de module)."""
    return _generer_pdf_commande(commande, mode="facture")

"""
Génération du PDF "Dashboard" — app stats (demande utilisateur du 2026-09-25, module
"Statistiken & KPIs" : "Export als PDF/Excel-Dashboard"). Même principe que apps.cotisations.pdf/
apps.boutique.pdf : un seul gabarit HTML (templates/stats/dashboard_pdf.html) rendu via
WeasyPrint, dans la langue de préférence de l'utilisateur qui exporte (accounts.User.
langue_preferee), portée FR/DE (l'arabe reste Phase 5 — voir docstring de apps.cotisations.pdf
pour le raisonnement complet, identique ici).

Contrairement aux reçus/factures (documents liés à UN enregistrement), ce PDF résume les 3
onglets du tableau de bord (Financier/Membres/Événements) pour les filtres actifs au moment de
l'export — un tableau de chiffres, pas une copie des graphiques (WeasyPrint ne sait pas
rendre les <canvas>/SVG de Recharts), cohérent avec les autres PDF déjà générés par
l'application, tous tabulaires plutôt qu'une capture d'écran.
"""

import base64
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from django.template.loader import render_to_string
from weasyprint import HTML

_ASSETS_DIR = Path(__file__).resolve().parent / "assets"

TRADUCTIONS = {
    "fr": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Supporters en Allemagne",
        "title": "Tableau de bord — Statistiques & KPIs",
        "indicateur": "Indicateur",
        "valeur": "Valeur",
        "section_financier": "Financier",
        "section_membres": "Membres",
        "section_evenements": "Événements",
        "section_top_contributeurs": "Top contributeurs",
        "membre": "Membre",
        "total": "Total",
        "footer_note": (
            "Document généré automatiquement à partir des filtres actifs au moment de "
            "l'export — les montants reflètent uniquement les écritures déjà comptabilisées."
        ),
        "footer_page": "Clubistes in Deutschland — Statistiken & KPIs",
        "libelles_financier": {
            "solde": "Solde",
            "recettes": "Recettes",
            "depenses": "Dépenses",
            "taux_collecte": "Taux de collecte",
            "cotisations_en_attente": "Cotisations en attente",
            "revenus_boutique": "Revenus boutique",
            "revenus_adhesions": "Revenus adhésions",
            "revenus_evenements": "Revenus événements",
        },
        "libelles_membres": {
            "total": "Total",
            "actifs": "Actifs",
            "inactifs": "Inactifs",
        },
        "libelles_evenements": {
            "nombre_evenements": "Nombre d'événements",
            "taux_remplissage_moyen": "Taux de remplissage moyen",
            "inscriptions_totales": "Inscriptions totales",
            "revenus": "Revenus",
        },
    },
    "de": {
        "assoc_name": "Clubistes in Deutschland",
        "assoc_tagline": "Club Africain de Tunis — Anhänger in Deutschland",
        "title": "Dashboard — Statistiken & KPIs",
        "indicateur": "Kennzahl",
        "valeur": "Wert",
        "section_financier": "Finanzen",
        "section_membres": "Mitglieder",
        "section_evenements": "Veranstaltungen",
        "section_top_contributeurs": "Top-Beitragende",
        "membre": "Mitglied",
        "total": "Gesamt",
        "footer_note": (
            "Automatisch erstelltes Dokument, basierend auf den zum Exportzeitpunkt aktiven "
            "Filtern — die Beträge umfassen nur bereits verbuchte Vorgänge."
        ),
        "footer_page": "Clubistes in Deutschland — Statistiken & KPIs",
        "libelles_financier": {
            "solde": "Saldo",
            "recettes": "Einnahmen",
            "depenses": "Ausgaben",
            "taux_collecte": "Einzugsquote",
            "cotisations_en_attente": "Ausstehende Beiträge",
            "revenus_boutique": "Shop-Einnahmen",
            "revenus_adhesions": "Mitgliedschafts-Einnahmen",
            "revenus_evenements": "Veranstaltungs-Einnahmen",
        },
        "libelles_membres": {
            "total": "Gesamt",
            "actifs": "Aktiv",
            "inactifs": "Inaktiv",
        },
        "libelles_evenements": {
            "nombre_evenements": "Anzahl Veranstaltungen",
            "taux_remplissage_moyen": "Durchschnittliche Auslastung",
            "inscriptions_totales": "Anmeldungen gesamt",
            "revenus": "Einnahmen",
        },
    },
}


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Voir apps.cotisations.pdf._logo_data_uri — même raison (évite toute dépendance à
    STATIC_URL pour WeasyPrint), copie locale de l'asset pour l'autonomie de chaque app."""
    contenu = (_ASSETS_DIR / "logo_cid.jpg").read_bytes()
    return f"data:image/jpeg;base64,{base64.b64encode(contenu).decode('ascii')}"


def _formate_montant(montant) -> str:
    montant = Decimal(str(montant))
    valeur = f"{montant:,.2f}".replace(",", " ").replace(".", ",")
    return f"{valeur} €"


def _resoudre_langue(user) -> str:
    """Même principe que apps.cotisations.pdf._resoudre_langue — voir sa docstring."""
    return user.langue_preferee if user and user.langue_preferee in TRADUCTIONS else "fr"


def generate_dashboard_pdf(
    *, kpis_financier, kpis_membres, kpis_evenements, user, filtres_affiches: str
) -> bytes:
    """Construit le PDF du dashboard "Statistiken & KPIs" — `kpis_*` sont déjà calculés/filtrés
    par l'appelant (voir apps.stats.views.StatsExportPdfView), `filtres_affiches` est un résumé
    textuel déjà formé des filtres actifs (ex. "Année 2026 — Ville : Berlin"), affiché tel quel
    en sous-titre plutôt que reconstruit ici (la vue connaît déjà le libellé de chaque filtre)."""
    langue = _resoudre_langue(user)
    t = TRADUCTIONS[langue]

    lignes_financier = [
        (t["libelles_financier"]["solde"], _formate_montant(kpis_financier["solde"])),
        (t["libelles_financier"]["recettes"], _formate_montant(kpis_financier["recettes"])),
        (t["libelles_financier"]["depenses"], _formate_montant(kpis_financier["depenses"])),
        (t["libelles_financier"]["taux_collecte"], f"{kpis_financier['taux_collecte']} %"),
        (
            t["libelles_financier"]["cotisations_en_attente"],
            _formate_montant(kpis_financier["cotisations_en_attente"]),
        ),
        (
            t["libelles_financier"]["revenus_boutique"],
            _formate_montant(kpis_financier["revenus_boutique"]),
        ),
        (
            t["libelles_financier"]["revenus_adhesions"],
            _formate_montant(kpis_financier["revenus_adhesions"]),
        ),
        (
            t["libelles_financier"]["revenus_evenements"],
            _formate_montant(kpis_financier["revenus_evenements"]),
        ),
    ]
    lignes_membres = [
        (t["libelles_membres"]["total"], kpis_membres["total"]),
        (t["libelles_membres"]["actifs"], kpis_membres["actifs"]),
        (t["libelles_membres"]["inactifs"], kpis_membres["inactifs"]),
    ]
    lignes_evenements = [
        (t["libelles_evenements"]["nombre_evenements"], kpis_evenements["nombre_evenements"]),
        (
            t["libelles_evenements"]["taux_remplissage_moyen"],
            f"{kpis_evenements['taux_remplissage_moyen']} %",
        ),
        (t["libelles_evenements"]["inscriptions_totales"], kpis_evenements["inscriptions_totales"]),
        (t["libelles_evenements"]["revenus"], _formate_montant(kpis_evenements["revenus"])),
    ]
    top_contributeurs = [
        {"nom": ligne["nom"], "total_formate": _formate_montant(ligne["total"])}
        for ligne in kpis_financier["top_contributeurs"]
    ]

    contexte = {
        "langue": langue,
        "t": t,
        "logo_data_uri": _logo_data_uri(),
        "subtitre_filtres": filtres_affiches,
        "lignes_financier": lignes_financier,
        "lignes_membres": lignes_membres,
        "lignes_evenements": lignes_evenements,
        "top_contributeurs": top_contributeurs,
    }
    html = render_to_string("stats/dashboard_pdf.html", contexte)
    return HTML(string=html).write_pdf()

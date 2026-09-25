"""
Export Excel du tableau de bord — app stats (demande utilisateur du 2026-09-25, module
"Statistiken & KPIs" : "Export als PDF/Excel-Dashboard").

Un seul classeur, 2 feuilles :
  - "KPIs" — un résumé des 3 onglets (Financier/Membres/Événements), libellé + valeur, exactement
    les mêmes chiffres que ceux affichés à l'écran pour les filtres demandés (voir
    apps.stats.views.StatsExportExcelView, qui appelle kpis_financier/kpis_membres/
    kpis_evenements avec les mêmes paramètres de requête que les 3 onglets).
  - "Finanzdaten" — le détail ligne à ligne de apps.stats.services.finances_liste (mêmes
    filtres), pour prolonger le résumé agrégé par les écritures individuelles.

Même style visuel (en-tête rouge #CC0000, colonnes identifiants forcées en texte, freeze_panes)
que apps.membres.exports/apps.boutique.exports, pour une seule identité visuelle d'export dans
toute l'application.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

_EN_TETE_STYLE = Font(bold=True, color="FFFFFF")
_REMPLISSAGE = PatternFill(start_color="CC0000", end_color="CC0000", fill_type="solid")


def _ecrire_en_tete(feuille, colonnes):
    for col_idx, libelle in enumerate(colonnes, start=1):
        cellule = feuille.cell(row=1, column=col_idx, value=libelle)
        cellule.font = _EN_TETE_STYLE
        cellule.fill = _REMPLISSAGE
        feuille.column_dimensions[cellule.column_letter].width = max(len(libelle) + 2, 12)
    feuille.freeze_panes = "A2"


def _feuille_kpis(classeur, kpis_financier, kpis_membres, kpis_evenements):
    feuille = classeur.active
    feuille.title = "KPIs"
    _ecrire_en_tete(feuille, ["Indicateur", "Valeur"])

    lignes = [
        ("Financier — Année", kpis_financier["annee"]),
        ("Financier — Solde (€)", float(kpis_financier["solde"])),
        ("Financier — Recettes (€)", float(kpis_financier["recettes"])),
        ("Financier — Dépenses (€)", float(kpis_financier["depenses"])),
        ("Financier — Taux de collecte (%)", kpis_financier["taux_collecte"]),
        ("Financier — Cotisations en attente (€)", float(kpis_financier["cotisations_en_attente"])),
        ("Financier — Revenus boutique (€)", float(kpis_financier["revenus_boutique"])),
        ("Financier — Revenus adhésions (€)", float(kpis_financier["revenus_adhesions"])),
        ("Financier — Revenus événements (€)", float(kpis_financier["revenus_evenements"])),
        ("Membres — Total", kpis_membres["total"]),
        ("Membres — Actifs", kpis_membres["actifs"]),
        ("Membres — Inactifs", kpis_membres["inactifs"]),
        ("Événements — Année", kpis_evenements["annee"]),
        ("Événements — Nombre", kpis_evenements["nombre_evenements"]),
        ("Événements — Taux de remplissage moyen (%)", kpis_evenements["taux_remplissage_moyen"]),
        ("Événements — Inscriptions totales", kpis_evenements["inscriptions_totales"]),
        ("Événements — Revenus (€)", float(kpis_evenements["revenus"])),
    ]
    for ligne_idx, (libelle, valeur) in enumerate(lignes, start=2):
        feuille.cell(row=ligne_idx, column=1, value=libelle)
        feuille.cell(row=ligne_idx, column=2, value=valeur)


def _feuille_finances(classeur, finances):
    feuille = classeur.create_sheet("Finanzdaten")
    colonnes = ["Type", "Date", "Membre", "Description", "Montant (€)", "Statut"]
    _ecrire_en_tete(feuille, colonnes)

    for ligne_idx, ligne in enumerate(finances, start=2):
        valeurs = [
            ligne["type"],
            ligne["date"].strftime("%d/%m/%Y"),
            ligne["membre_nom"],
            ligne["description"],
            float(ligne["montant"]),
            ligne["statut"],
        ]
        for col_idx, valeur in enumerate(valeurs, start=1):
            feuille.cell(row=ligne_idx, column=col_idx, value=valeur)


def construire_classeur_dashboard(
    *, kpis_financier, kpis_membres, kpis_evenements, finances
) -> Workbook:
    """Construit (sans l'enregistrer) le classeur .xlsx d'export du dashboard "Statistiken &
    KPIs" — tous les arguments sont déjà calculés/filtrés par l'appelant (voir
    apps.stats.views.StatsExportExcelView), même séparation des responsabilités que
    apps.boutique.exports.construire_classeur_commandes."""
    classeur = Workbook()
    _feuille_kpis(classeur, kpis_financier, kpis_membres, kpis_evenements)
    _feuille_finances(classeur, finances)
    return classeur

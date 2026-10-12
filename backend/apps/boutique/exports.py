"""
Export Excel des commandes — app boutique (demande utilisateur du 2026-09-25, module
"Shop-Verwaltung" : "Es soll möglich sein die Bestellungen als Excel zu exportieren").

Le queryset est filtré/scopé par l'appelant (CommandeViewSet.export — mêmes filtres que la
liste, voir CommandeFilter, et même scope IDOR que get_queryset) : ce module ne fait que
construire le classeur, même séparation des responsabilités que
apps.membres.exports/export_views. Même style visuel (en-tête rouge #CC0000) que
apps.membres.exports.construire_classeur_export, pour une seule identité visuelle d'export dans
toute l'application.
"""

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from apps.membres.utils_http import safe_cell

from .models import Reservierung, StatutCommande

_EN_TETE_STYLE = Font(bold=True, color="FFFFFF")
_REMPLISSAGE = PatternFill(start_color="CC0000", end_color="CC0000", fill_type="solid")

# Colonnes disponibles à l'export, dans leur ordre d'affichage — pas de sélection de colonnes
# ici (contrairement à apps.membres.exports) : la demande utilisateur ne porte que sur l'export
# en lui-même, sans mention d'un besoin de personnalisation des colonnes.
_COLONNES = [
    "N° commande",
    "Destinataire",
    "Email membre",
    "Montant total (€)",
    "Bon d'achat déduit (€)",
    "Montant dû (€)",
    "Statut",
    "Mode de paiement",
    "Date de commande",
    "Date de paiement",
    "N° de suivi",
    "Transporteur",
    "Date d'expédition",
]

# Colonnes forcées au format Texte Excel (number_format '@') — mêmes raisons que
# apps.membres.exports.CHAMPS_TEXTE : un identifiant/numéro de suivi ne doit jamais être
# réinterprété comme un nombre à l'ouverture du fichier.
_COLONNES_TEXTE = {1, 11}  # N° commande, N° de suivi


def _formater_date(valeur) -> str:
    return valeur.strftime("%d/%m/%Y %H:%M") if valeur else ""


def construire_classeur_commandes(
    queryset, produkt_ids=None, mit_reservierungen: bool = False
) -> Workbook:
    """
    Construit (sans l'enregistrer) le classeur .xlsx d'export des commandes — `queryset` doit
    déjà être filtré/scopé par l'appelant (voir CommandeViewSet.export). Un export n'est pas
    paginé : il contient toute la sélection filtrée, comme pour
    apps.membres.exports.construire_classeur_export.
    """
    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Commandes"

    for col_idx, libelle in enumerate(_COLONNES, start=1):
        cellule = feuille.cell(row=1, column=col_idx, value=libelle)
        cellule.font = _EN_TETE_STYLE
        cellule.fill = _REMPLISSAGE

    ligne_idx = 2
    for commande in queryset.select_related("membre"):
        valeurs = [
            commande.numero_commande,
            commande.nom_destinataire,
            commande.membre.email if commande.membre else "",
            float(commande.montant_total),
            float(commande.montant_bon_achat),
            float(commande.montant_du),
            commande.get_statut_display(),
            commande.get_mode_paiement_display() if commande.mode_paiement else "",
            _formater_date(commande.created_at),
            _formater_date(commande.date_paiement_confirme),
            commande.numero_suivi,
            commande.transporteur,
            _formater_date(commande.date_expedition),
        ]
        for col_idx, valeur in enumerate(valeurs, start=1):
            cellule = feuille.cell(row=ligne_idx, column=col_idx, value=safe_cell(valeur))
            if col_idx in _COLONNES_TEXTE:
                cellule.number_format = "@"
        ligne_idx += 1

    for col_idx, libelle in enumerate(_COLONNES, start=1):
        feuille.column_dimensions[feuille.cell(row=1, column=col_idx).column_letter].width = max(
            len(libelle) + 2, 12
        )
    feuille.freeze_panes = "A2"

    _blatt_positionen(classeur, queryset, produkt_ids)
    if mit_reservierungen:
        _blatt_reservierungen(classeur, produkt_ids)
    return classeur


# ── Release 6 (2026-10-12): Export pro Artikel mit Status ───────────────────────────────────

_BEZAHLT = {
    StatutCommande.CONFIRMEE,
    StatutCommande.EN_PREPARATION,
    StatutCommande.EXPEDIEE,
    StatutCommande.LIVREE,
}
_STORNIERT = {StatutCommande.ANNULEE, StatutCommande.REMBOURSEE}


def _kopf(feuille, spalten):
    for idx, libelle in enumerate(spalten, start=1):
        zelle = feuille.cell(row=1, column=idx, value=libelle)
        zelle.font = _EN_TETE_STYLE
        zelle.fill = _REMPLISSAGE
        feuille.column_dimensions[zelle.column_letter].width = max(len(libelle) + 2, 12)
    feuille.freeze_panes = "A2"


def _schreibe(feuille, zeile, werte, textspalten=()):
    for idx, wert in enumerate(werte, start=1):
        zelle = feuille.cell(row=zeile, column=idx, value=safe_cell(wert))
        if idx in textspalten:
            zelle.number_format = "@"


def _blatt_positionen(classeur, queryset, produkt_ids):
    """Blatt „Positionen“ (eine Zeile pro Bestellposition, optional nur die gefilterten Artikel)
    und Blatt „Summen“ (pro Artikel/Variante: Mengen nach Status, Umsatz bezahlt)."""
    positionen = classeur.create_sheet("Positionen")
    _kopf(
        positionen,
        [
            "N° commande", "Datum", "Status", "Mitglied-Nr.", "Name", "E-Mail", "Artikel",
            "Größe", "Farbe", "Menge", "Einzelpreis (€)", "Positionssumme (€)", "Zahlungsart",
            "Bezahlt am", "Zahlungsfrist",
        ],
    )  # fmt: skip
    summen: dict[tuple, dict] = {}
    zeile = 2
    erlaubt = {str(p) for p in produkt_ids} if produkt_ids else None
    for commande in queryset.select_related("membre"):
        for ligne in commande.lignes.all():
            produit = ligne.variante.produit
            if erlaubt is not None and str(produit.id) not in erlaubt:
                continue
            membre = commande.membre
            _schreibe(
                positionen,
                zeile,
                [
                    commande.numero_commande,
                    _formater_date(commande.created_at),
                    commande.get_statut_display(),
                    membre.numero_membre if membre else "",
                    f"{membre.prenom} {membre.nom}".strip() if membre else "",
                    membre.email if membre else "",
                    produit.nom,
                    ligne.variante.taille,
                    ligne.variante.couleur,
                    ligne.quantite,
                    float(ligne.prix_unitaire),
                    float(ligne.sous_total_net),
                    commande.get_mode_paiement_display() if commande.mode_paiement else "",
                    _formater_date(commande.date_paiement_confirme),
                    _formater_date(commande.zahlung_bis),
                ],
                textspalten={1},
            )
            zeile += 1
            eintrag = summen.setdefault(
                (produit.nom, ligne.variante.taille, ligne.variante.couleur),
                {"alle": 0, "bezahlt": 0, "offen": 0, "storniert": 0, "umsatz": 0.0},
            )
            eintrag["alle"] += ligne.quantite
            if commande.statut in _BEZAHLT:
                eintrag["bezahlt"] += ligne.quantite
                eintrag["umsatz"] += float(ligne.sous_total_net)
            elif commande.statut in _STORNIERT:
                eintrag["storniert"] += ligne.quantite
            else:
                eintrag["offen"] += ligne.quantite

    blatt = classeur.create_sheet("Summen")
    _kopf(
        blatt,
        [
            "Artikel", "Größe", "Farbe", "Menge gesamt", "davon bezahlt", "davon offen",
            "davon storniert/erstattet", "Umsatz bezahlt (€)",
        ],
    )  # fmt: skip
    for nr, (schluessel, e) in enumerate(sorted(summen.items()), start=2):
        _schreibe(
            blatt,
            nr,
            [
                *schluessel,
                e["alle"],
                e["bezahlt"],
                e["offen"],
                e["storniert"],
                round(e["umsatz"], 2),
            ],
        )


def _blatt_reservierungen(classeur, produkt_ids):
    """Blatt „Reservierungen“ (Modus „nur reservieren“), optional nur die gewählten Artikel."""
    queryset = Reservierung.objects.select_related("produit", "variante", "membre")
    if produkt_ids:
        queryset = queryset.filter(produit_id__in=produkt_ids)
    blatt = classeur.create_sheet("Reservierungen")
    _kopf(
        blatt,
        [
            "Datum", "Artikel", "Größe", "Farbe", "Mitglied-Nr.", "Name", "E-Mail", "Menge",
            "Status", "Bemerkung",
        ],
    )  # fmt: skip
    for nr, r in enumerate(queryset, start=2):
        _schreibe(
            blatt,
            nr,
            [
                _formater_date(r.created_at),
                r.produit.nom,
                r.variante.taille if r.variante else "",
                r.variante.couleur if r.variante else "",
                r.membre.numero_membre,
                f"{r.membre.prenom} {r.membre.nom}".strip(),
                r.membre.email,
                r.quantite,
                r.get_statut_display(),
                r.bemerkung,
            ],
        )

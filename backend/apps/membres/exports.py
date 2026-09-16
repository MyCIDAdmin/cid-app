"""
Export Excel du répertoire des membres — RICEFW R-002 ("Liste des membres | Répertoire
membres avec statut, ville, cotisation, badges | Admin, RH, Bureau | P0 | Excel/CSV/PDF").

Portée volontairement limitée à ce que la demande utilisateur du 2026-09-16 couvre
("exporter en Excel la liste [des membres], filtrée/triée, avec informations") : Excel
uniquement (CSV/PDF non demandés, à ajouter séparément si besoin) ; la colonne "badges" du
RICEFW est omise — aucun modèle ne porte cette notion dans l'application actuelle (à
construire le jour où la fonctionnalité elle-même existera, pas avant).

Le filtrage réutilise MembreFilter (apps.membres.filters) — même FilterSet que
MembreViewSet.list, pour que l'export d'une sélection donnée corresponde toujours exactement
à ce que l'écran de liste montrerait avec les mêmes filtres. Le tri est en revanche un
paramètre propre à cette vue (voir export_views.py) : MembreViewSet utilise une pagination
cursor à ordre fixe (nom, prenom, id — voir MembreCursorPagination), qui ne supporte pas un
tri dynamique par requête ; un export n'est pas paginé et peut donc trier librement sans
casser cette contrainte.
"""

from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle

from .serializers import _mask

# Champs de tri acceptés par MembreExportView (voir export_views.py) — liste blanche
# volontairement restreinte à des champs réellement utiles pour trier un répertoire membres,
# indexés ou peu coûteux à trier (voir Membre.Meta.indexes). "ordering" accepte une liste de
# champs séparés par des virgules, chacun préfixable de "-" pour un tri descendant (même
# convention que rest_framework.filters.OrderingFilter, déjà utilisé ailleurs dans le projet).
ORDERING_FIELDS = {"nom", "prenom", "numero_membre", "statut", "ville_de", "date_adhesion", "pays"}
ORDERING_PAR_DEFAUT = ["nom", "prenom"]


def parse_ordering(valeur: str | None) -> list:
    """
    Valide `valeur` (paramètre `ordering` de la requête) contre ORDERING_FIELDS et retourne la
    liste de champs à passer à `.order_by()`. Un champ inconnu est silencieusement ignoré
    plutôt que de faire échouer l'export — l'utilisateur voit alors un tri par défaut plutôt
    qu'une erreur 400 pour un simple souci d'orthographe dans l'URL.
    """
    if not valeur:
        return list(ORDERING_PAR_DEFAUT)
    champs = []
    for champ in valeur.split(","):
        champ = champ.strip()
        nom_nu = champ[1:] if champ.startswith("-") else champ
        if nom_nu in ORDERING_FIELDS:
            champs.append(champ)
    return champs or list(ORDERING_PAR_DEFAUT)


def _cotisation_annee_en_cours_payee_ids(annee: int) -> set:
    """
    Ensemble des id de membres ayant une cotisation annuelle PAYÉE pour `annee` — une seule
    requête pour tout l'export plutôt qu'une par membre (évite un N+1 sur potentiellement
    plusieurs centaines de lignes).
    """
    return set(
        Cotisation.objects.filter(
            type_article=TypeArticle.COTISATION,
            annee=annee,
            statut=StatutCotisation.PAYEE,
        ).values_list("membre_id", flat=True)
    )


def _formater_date(valeur) -> str:
    return valeur.strftime("%d/%m/%Y") if valeur else ""


def construire_classeur_export(queryset) -> Workbook:
    """
    Construit (sans l'enregistrer) le classeur .xlsx d'export — `queryset` doit déjà être
    filtré et trié par l'appelant (voir export_views.MembreExportView). Même style visuel que
    le template d'import (apps.membres.imports.construire_classeur_template — en-tête rouge
    #CC0000, une seule source de vérité visuelle entre import et export).

    CIN : jamais démasqué dans l'export, même pour un rôle RH+ qui pourrait le voir en clair
    fiche par fiche (voir MembreSerializer._can_view_pii) — même choix que la vue liste
    (MembreListSerializer, "jamais nécessaire pour un simple listing, réduit la surface
    d'exposition"), qui s'applique d'autant plus à un fichier téléchargeable regroupant tous
    les membres d'un coup.
    """
    annee_courante = timezone.localdate().year
    cotisations_payees_ids = _cotisation_annee_en_cours_payee_ids(annee_courante)

    entetes = [
        "N° membre",
        "Prénom",
        "Nom",
        "Email",
        "Téléphone",
        "CIN",
        "Date de naissance",
        "Âge",
        "Sexe",
        "Pays",
        "Adresse (Allemagne)",
        "Code postal",
        "Ville",
        "Land",
        "Ville d'origine (Tunisie)",
        "Gouvernorat (Tunisie)",
        "Statut",
        "Date d'adhésion",
        f"Cotisation {annee_courante}",
    ]

    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Membres"

    en_tete_style = Font(bold=True, color="FFFFFF")
    remplissage = PatternFill(start_color="CC0000", end_color="CC0000", fill_type="solid")
    for col_idx, libelle in enumerate(entetes, start=1):
        cellule = feuille.cell(row=1, column=col_idx, value=libelle)
        cellule.font = en_tete_style
        cellule.fill = remplissage

    ligne_idx = 2
    for membre in queryset:
        cotisation_valeur = "Payée" if membre.id in cotisations_payees_ids else "En attente"
        valeurs = [
            membre.numero_membre,
            membre.prenom,
            membre.nom,
            membre.email,
            membre.telephone,
            _mask(membre.cin),
            _formater_date(membre.date_naissance),
            membre.age,
            membre.get_sexe_display(),
            membre.get_pays_display(),
            membre.adresse_de,
            membre.code_postal_de,
            membre.ville_de,
            membre.get_land_de_display() if membre.land_de else "",
            membre.ville_origine_tn,
            membre.gouvernorat_tn,
            membre.get_statut_display(),
            _formater_date(membre.date_adhesion),
            cotisation_valeur,
        ]
        for col_idx, valeur in enumerate(valeurs, start=1):
            feuille.cell(row=ligne_idx, column=col_idx, value=valeur)
        ligne_idx += 1

    for col_idx, libelle in enumerate(entetes, start=1):
        feuille.column_dimensions[feuille.cell(row=1, column=col_idx).column_letter].width = max(
            len(libelle) + 2, 12
        )
    feuille.freeze_panes = "A2"

    return classeur

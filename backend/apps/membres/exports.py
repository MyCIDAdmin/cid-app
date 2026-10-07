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

Suite retour utilisateur du 2026-09-16 (deuxième demande, après la mise en service ci-dessus) :
  1. Les colonnes contenant des identifiants (N° membre, téléphone, CIN, code postal) doivent
     être exportées explicitement au format Texte Excel (number_format '@'), pour qu'Excel ne
     les réinterprète jamais comme un nombre/une date à l'ouverture (perte des zéros non
     significatifs sur un code postal ou une CIN, notation scientifique sur un long numéro de
     téléphone, etc.).
  2. L'utilisateur doit pouvoir choisir les colonnes à exporter plutôt que de toujours recevoir
     le classeur complet — voir `champs`/CHAMPS_EXPORT/parse_champs ci-dessous, et le paramètre
     `champs` de MembreExportView (export_views.py).

Suite retour utilisateur du 2026-09-16 (troisième demande) : la CIN est désormais exportée en
clair, et non plus masquée (•••••xxx). Revient sur le choix initial ("jamais démasqué dans
l'export, même pour RH+, réduit la surface d'exposition") à la demande explicite de
l'utilisateur — reste cohérent avec le contrôle d'accès existant : MembreExportView est déjà
réservée à RH+ (IsRHOrAbove), qui peut de toute façon déjà consulter la CIN en clair fiche par
fiche (voir MembreSerializer._can_view_pii). Le format Texte forcé (point 1 ci-dessus) reste
donc d'autant plus utile : une CIN correspond typiquement à une chaîne de chiffres, avec un
risque réel de perte des zéros non significatifs si Excel la traitait comme un nombre.
"""

from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.membres.utils_http import safe_cell

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


# Colonnes disponibles à l'export, dans leur ordre d'affichage canonique — clé technique
# (valeur acceptée par le paramètre `champs` de MembreExportView, voir parse_champs) -> libellé
# Excel. Le libellé de la dernière colonne dépend de l'année en cours ; CHAMPS_EXPORT porte un
# libellé générique, construire_classeur_export le complète avec l'année au moment de l'appel.
CHAMPS_EXPORT = [
    ("numero_membre", "N° membre"),
    ("prenom", "Prénom"),
    ("nom", "Nom"),
    ("email", "Email"),
    ("telephone", "Téléphone"),
    ("cin", "CIN"),
    ("date_naissance", "Date de naissance"),
    ("age", "Âge"),
    ("sexe", "Sexe"),
    ("pays", "Pays"),
    ("adresse_de", "Adresse (Allemagne)"),
    ("code_postal_de", "Code postal"),
    ("ville_de", "Ville"),
    ("land_de", "Land"),
    ("ville_origine_tn", "Ville d'origine (Tunisie)"),
    ("gouvernorat_tn", "Gouvernorat (Tunisie)"),
    ("statut", "Statut"),
    ("date_adhesion", "Date d'adhésion"),
    ("cotisation_annee_en_cours", "Cotisation"),
]
CHAMPS_EXPORT_CLES = [cle for cle, _ in CHAMPS_EXPORT]

# Colonnes forcées au format Texte Excel (number_format '@') — des identifiants qui ne doivent
# jamais être réinterprétés comme un nombre à l'ouverture du fichier (zéros non significatifs
# d'un code postal, notation scientifique sur un long numéro de téléphone...). Le CIN est inclus
# par précaution même si sa valeur masquée (•••••xxx) n'est de toute façon jamais numérique.
CHAMPS_TEXTE = {"numero_membre", "telephone", "cin", "code_postal_de"}


def parse_champs(valeur: str | None) -> list:
    """
    Valide `valeur` (paramètre `champs` de la requête, liste de clés séparées par des virgules
    — voir CHAMPS_EXPORT) et retourne la liste des clés à exporter, dans l'ordre d'affichage
    canonique (pas l'ordre demandé par l'appelant, pour un fichier toujours lisible de la même
    façon quel que soit l'ordre de sélection côté écran). Même politique de tolérance que
    parse_ordering : une clé inconnue est silencieusement ignorée plutôt que de faire échouer
    l'export ; si la sélection ne contient alors plus aucune clé valide, on retombe sur toutes
    les colonnes plutôt que de renvoyer un classeur vide.
    """
    if not valeur:
        return list(CHAMPS_EXPORT_CLES)
    demandees = {c.strip() for c in valeur.split(",")}
    selection = [cle for cle in CHAMPS_EXPORT_CLES if cle in demandees]
    return selection or list(CHAMPS_EXPORT_CLES)


def _valeurs_membre(membre, *, cotisations_payees_ids) -> dict:
    """
    Valeur "brute" de chaque colonne exportable pour un membre, sous forme de dict plutôt que
    de liste positionnelle — construire_classeur_export peut ainsi n'en garder qu'un
    sous-ensemble (voir `champs`) sans avoir à réordonner quoi que ce soit à la main.

    CIN exportée en clair (demande utilisateur du 2026-09-16, 3e — voir docstring de module) :
    `membre.cin` est un EncryptedCharField, déchiffré automatiquement à l'accès ; l'export
    reste réservé à RH+ (IsRHOrAbove, voir MembreExportView), qui peut de toute façon déjà
    consulter la CIN en clair fiche par fiche (MembreSerializer._can_view_pii).
    """
    return {
        "numero_membre": membre.numero_membre,
        "prenom": membre.prenom,
        "nom": membre.nom,
        "email": membre.email,
        "telephone": membre.telephone,
        "cin": membre.cin,
        "date_naissance": _formater_date(membre.date_naissance),
        "age": membre.age,
        "sexe": membre.get_sexe_display(),
        "pays": membre.get_pays_display(),
        "adresse_de": membre.adresse_de,
        "code_postal_de": membre.code_postal_de,
        "ville_de": membre.ville_de,
        "land_de": membre.get_land_de_display() if membre.land_de else "",
        "ville_origine_tn": membre.ville_origine_tn,
        "gouvernorat_tn": membre.gouvernorat_tn,
        "statut": membre.get_statut_display(),
        "date_adhesion": _formater_date(membre.date_adhesion),
        "cotisation_annee_en_cours": (
            "Payée" if membre.id in cotisations_payees_ids else "En attente"
        ),
    }


def construire_classeur_export(queryset, champs: list | None = None) -> Workbook:
    """
    Construit (sans l'enregistrer) le classeur .xlsx d'export — `queryset` doit déjà être
    filtré et trié par l'appelant (voir export_views.MembreExportView). Même style visuel que
    le template d'import (apps.membres.imports.construire_classeur_template — en-tête rouge
    #CC0000, une seule source de vérité visuelle entre import et export).

    `champs` : sous-ensemble et ordre des colonnes à inclure (clés de CHAMPS_EXPORT, voir
    parse_champs) — toutes les colonnes par défaut (`None`).
    """
    annee_courante = timezone.localdate().year
    cotisations_payees_ids = _cotisation_annee_en_cours_payee_ids(annee_courante)

    champs = list(champs) if champs else list(CHAMPS_EXPORT_CLES)
    libelles = dict(CHAMPS_EXPORT)
    libelles["cotisation_annee_en_cours"] = f"Cotisation {annee_courante}"
    entetes = [libelles[cle] for cle in champs]

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
        valeurs = _valeurs_membre(membre, cotisations_payees_ids=cotisations_payees_ids)
        for col_idx, cle in enumerate(champs, start=1):
            cellule = feuille.cell(row=ligne_idx, column=col_idx, value=safe_cell(valeurs[cle]))
            if cle in CHAMPS_TEXTE:
                cellule.number_format = "@"
        ligne_idx += 1

    for col_idx, libelle in enumerate(entetes, start=1):
        feuille.column_dimensions[feuille.cell(row=1, column=col_idx).column_letter].width = max(
            len(libelle) + 2, 12
        )
    feuille.freeze_panes = "A2"

    return classeur

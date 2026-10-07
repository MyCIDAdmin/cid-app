"""
Import Excel de l'HISTORIQUE DE STATUT ASSOCIATIF par année (demande utilisateur du 2026-09-19)
— complète apps.membres.imports (qui crée de nouvelles fiches Membre) : celui-ci met à jour
apps.membres.models.HistoriqueStatutMembre pour des membres DÉJÀ EN BASE, à partir des vraies
données historiques du club (anciens registres/tableurs), plutôt que de s'appuyer uniquement sur
la reconstruction automatique et approximative faite par la migration 0004 (qui ne peut déduire
l'historique qu'à partir des `Cotisation` déjà présentes en base — souvent incomplètes pour les
années les plus anciennes, notamment pré-numérisation).

Format retenu (décision utilisateur, AskUserQuestion du 2026-09-19) : une ligne par membre, une
colonne par année — n'importe quel en-tête reconnu comme un nombre à 4 chiffres plausible
(ANNEE_MIN..ANNEE_MAX) est traité comme une colonne d'année, pas de liste figée à régénérer
chaque année — avec pour valeur "actif"/"inactif" (case ignorée, cellule vide = aucune donnée
pour ce (membre, année), ignorée silencieusement, jamais une erreur).

Identification du membre (décision utilisateur) : email ET cin, tous deux obligatoires dans le
fichier. Si les deux désignent des membres DIFFÉRENTS déjà en base, la ligne est rejetée (ambigu)
plutôt que de deviner lequel des deux privilégier — si un seul des deux correspond (l'autre est
soit absent du fichier soit ne correspond à aucun membre), celui qui correspond suffit.

Cette source fait AUTORITÉ sur les données déjà présentes (décision utilisateur) : une ligne
(membre, année) du fichier écrase silencieusement une éventuelle entrée existante (ex. celle
posée par la migration 0004 ou par un import précédent) si elle diffère — même mécanisme d'upsert
que apps.membres.services.enregistrer_statut_annuel, réutilisé ici avec `notifier_membre=False` :
contrairement à un paiement confirmé ou une échéance dépassée, un import en masse de données
historiques n'est pas un événement personnel pour le membre et ne doit jamais déclencher
notification/email (potentiellement des centaines à la fois).
"""

import datetime
from dataclasses import dataclass, field

import openpyxl

from .models import Membre, RaisonChangementStatut, StatutMembre
from .services import enregistrer_statut_annuel

ANNEE_MIN = 2000
ANNEE_MAX = 2100  # large marge défensive — un en-tête hors de cette plage n'est simplement pas
# traité comme une colonne d'année (ex. un futur en-tête "total" ou "notes" resterait ignoré).

_STATUT_ALIASES = {"actif": StatutMembre.ACTIF, "inactif": StatutMembre.INACTIF}


def _normalize(value) -> str:
    return str(value).strip().lower() if value is not None else ""


@dataclass
class LigneErreurHistorique:
    ligne: int
    message: str


@dataclass
class ResultatImportHistorique:
    total: int = 0
    lignes_traitees: int = 0
    entrees_importees: int = (
        0  # nombre de cellules (membre, année) écrites, toutes lignes confondues
    )
    lignes_ignorees: int = 0
    erreurs: list = field(default_factory=list)  # list[LigneErreurHistorique]

    def as_dict(self):
        return {
            "total": self.total,
            "lignes_traitees": self.lignes_traitees,
            "entrees_importees": self.entrees_importees,
            "lignes_ignorees": self.lignes_ignorees,
            "erreurs": [{"ligne": e.ligne, "message": e.message} for e in self.erreurs],
        }


class ImportHistoriqueSchemaError(Exception):
    """Le fichier n'a pas la colonne obligatoire (email) ou aucune colonne d'année
    reconnue — rejeté avant toute lecture de ligne."""


def _map_identite(header_row) -> dict:
    normalized = [_normalize(c) for c in header_row]
    mapping = {}
    for champ, aliases in (("email", ("email", "e-mail", "mail")), ("cin", ("cin",))):
        for idx, header in enumerate(normalized):
            if header in aliases:
                mapping[champ] = idx
                break
    return mapping


def _annees_colonnes(header_row) -> dict:
    """Retourne {annee: index_colonne} pour chaque en-tête reconnu comme une année."""
    annees = {}
    for idx, cell in enumerate(header_row):
        brut = _normalize(cell)
        if brut.isdigit() and ANNEE_MIN <= int(brut) <= ANNEE_MAX:
            annees[int(brut)] = idx
    return annees


def construire_classeur_template_historique():
    """Classeur vierge — email/cin + colonnes d'exemple pour les 6 dernières années écoulées.
    L'import lui-même accepte n'importe quelle colonne d'année (voir docstring de module) : ce
    ne sont que des colonnes d'exemple pour guider la saisie, pas une liste figée."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    annee_courante = datetime.date.today().year
    annees_exemple = list(range(annee_courante - 6, annee_courante))

    classeur = Workbook()
    feuille = classeur.active
    feuille.title = "Historique"

    en_tetes = ["email", "cin"] + [str(a) for a in annees_exemple]
    en_tete_style = Font(bold=True, color="FFFFFF")
    remplissage = PatternFill(start_color="CC0000", end_color="CC0000", fill_type="solid")
    for col_idx, champ in enumerate(en_tetes, start=1):
        cellule = feuille.cell(row=1, column=col_idx, value=champ)
        cellule.font = en_tete_style
        cellule.fill = remplissage
        feuille.column_dimensions[cellule.column_letter].width = max(len(champ) + 2, 12)

    exemple = ["riadh.bchini@example.de", "12345678"] + [
        "actif",
        "actif",
        "inactif",
        "actif",
        "actif",
        "actif",
    ]
    for col_idx, valeur in enumerate(exemple, start=1):
        feuille.cell(row=2, column=col_idx, value=valeur)

    notes = classeur.create_sheet("Notes")
    notes["A1"] = (
        "Colonne obligatoire : email. Colonne cin facultative (aide à retrouver un membre "
        "dont l'email a changé). Identifient un membre DÉJÀ EXISTANT."
    )
    notes["A2"] = (
        "Une colonne par année (n'importe quel en-tête numérique à 4 chiffres, ex. 2020, "
        "2021, ...) — valeur : actif / inactif. Cellule vide = aucune donnée pour ce membre "
        "cette année-là (ignorée, pas une erreur)."
    )
    notes["A3"] = (
        "Ce fichier fait AUTORITÉ : une valeur remplace toute entrée déjà existante pour le "
        "même (membre, année), y compris une entrée reconstruite automatiquement."
    )
    notes["A4"] = (
        "Le membre doit déjà exister en base (créé via l'import membres classique ou "
        "manuellement) — cet import ne crée jamais de nouvelle fiche membre."
    )
    notes.column_dimensions["A"].width = 100

    return classeur


def _resoudre_membre(email, cin, cache_email: dict, cache_cin: dict) -> Membre:
    """Retrouve le Membre déjà en base par email et/ou cin. Lève ValueError si ni l'un ni
    l'autre ne correspond à un membre existant, ou si les deux correspondent à des membres
    DIFFÉRENTS (ambigu — jamais deviner lequel privilégier)."""
    email_norm = _normalize(email)
    cin_norm = str(cin).strip() if cin not in (None, "") else ""

    membre_email = cache_email.get(email_norm) if email_norm else None
    membre_cin = cache_cin.get(cin_norm) if cin_norm else None

    if membre_email and membre_cin and membre_email.id != membre_cin.id:
        raise ValueError(f"email {email!r} et cin {cin!r} désignent 2 membres différents en base")
    membre = membre_email or membre_cin
    if membre is None:
        raise ValueError(f"aucun membre existant pour email={email!r} / cin={cin!r}")
    return membre


def importer_historique_statuts(fichier) -> ResultatImportHistorique:
    """
    `fichier` : objet fichier (ex. InMemoryUploadedFile) positionné au début, contenant un
    classeur .xlsx avec une feuille de données en première position, 1ère ligne = en-têtes.
    """
    resultat = ResultatImportHistorique()

    try:
        classeur = openpyxl.load_workbook(fichier, read_only=True, data_only=True)
    except Exception as exc:  # openpyxl lève plusieurs types selon le problème
        raise ImportHistoriqueSchemaError(f"Fichier Excel illisible : {exc}") from exc

    feuille = classeur.worksheets[0]
    lignes = feuille.iter_rows(values_only=True)
    try:
        entetes = next(lignes)
    except StopIteration:
        raise ImportHistoriqueSchemaError("Le fichier est vide.")

    identite = _map_identite(entetes)
    # cin facultatif depuis le 2026-10-07 (membres sans CIN) : l'email suffit à identifier.
    manquantes = [c for c in ("email",) if c not in identite]
    if manquantes:
        raise ImportHistoriqueSchemaError(
            "Colonnes obligatoires manquantes : " + ", ".join(manquantes)
        )

    annees_colonnes = _annees_colonnes(entetes)
    if not annees_colonnes:
        raise ImportHistoriqueSchemaError(
            "Aucune colonne d'année reconnue (en-tête numérique à 4 chiffres attendu, ex. 2024)."
        )

    # Caches de résolution — un seul passage sur tous les Membre (déchiffrement CIN inclus, même
    # logique/limite documentée que apps.membres.imports._cin_email_existants), plutôt qu'une
    # requête par ligne du fichier.
    cache_email, cache_cin = {}, {}
    for membre in Membre.objects.all():
        cache_email[membre.email.lower()] = membre
        cache_cin[membre.cin] = membre

    for numero_ligne, row in enumerate(lignes, start=2):  # ligne 1 = en-têtes
        if row is None or all(c is None for c in row):
            continue  # ligne vide — ignorée silencieusement, pas une erreur
        resultat.total += 1

        email = row[identite["email"]]
        cin = row[identite["cin"]]
        try:
            membre = _resoudre_membre(email, cin, cache_email, cache_cin)
        except ValueError as exc:
            resultat.erreurs.append(LigneErreurHistorique(ligne=numero_ligne, message=str(exc)))
            resultat.lignes_ignorees += 1
            continue

        entrees_ligne = 0
        erreurs_ligne = []
        # Ordre chronologique croissant : enregistrer_statut_annuel ne fait progresser le
        # statut COURANT que vers l'année la plus récente déjà connue — traiter les colonnes
        # dans l'ordre du fichier plutôt que par année pourrait, pour la même ligne, écrire une
        # année récente puis une année plus ancienne et laisser le statut courant dans un état
        # qui dépend de l'ordre des colonnes plutôt que du contenu.
        for annee in sorted(annees_colonnes):
            idx = annees_colonnes[annee]
            valeur_brute = _normalize(row[idx]) if idx < len(row) else ""
            if not valeur_brute:
                continue  # cellule vide : aucune donnée pour ce (membre, année)
            statut = _STATUT_ALIASES.get(valeur_brute)
            if statut is None:
                erreurs_ligne.append(f"année {annee} : valeur invalide {row[idx]!r}")
                continue
            enregistrer_statut_annuel(
                membre,
                annee,
                statut,
                RaisonChangementStatut.MANUEL,
                date_effet=datetime.datetime(annee, 1, 1, tzinfo=datetime.timezone.utc),
                notifier_membre=False,
            )
            entrees_ligne += 1

        if erreurs_ligne:
            resultat.erreurs.append(
                LigneErreurHistorique(ligne=numero_ligne, message="; ".join(erreurs_ligne))
            )
        if entrees_ligne:
            resultat.entrees_importees += entrees_ligne
            resultat.lignes_traitees += 1
        elif not erreurs_ligne:
            # Ligne reconnue (membre trouvé) mais sans aucune cellule d'année renseignée.
            resultat.lignes_ignorees += 1

    return resultat

"""
Import Excel des membres historiques — RICEFW C-001 (Import initial membres,
P0) / W-008 (workflow "Import Excel membres").

Portée volontairement limitée à ce que RICEFW décrit : lecture openpyxl,
validation de schéma + doublons email/CIN, chiffrement (délégué à
Membre.save() via EncryptedCharField), et un journal ligne par ligne
OK/KO (RICEFW R-012 "Journal import Master Data").

Décision importante : l'import est volontairement "best effort" ligne par
ligne (pas une transaction unique tout-ou-rien) — une ligne invalide est
consignée en erreur et n'empêche pas l'import des ~299 autres. C'est ce que
décrit W-008 ("générer journal OK/KO/erreurs"), qui suppose un import
partiel possible.

Limite connue (documentée, pas un bug) : cin/passeport sont chiffrés en
AES-256-GCM (nonce aléatoire par valeur — deux chiffrements du même CIN en
clair produisent des ciphertexts différents). Il est donc impossible de
poser un index unique BDD dessus. La détection de doublon CIN se fait donc
en clair, en mémoire, en déchiffrant les CIN déjà en base — acceptable pour
un import ponctuel de quelques centaines de lignes (C-001 : ~300), mais ne
pas réutiliser cette approche pour une détection de doublon "à l'échelle".
"""

import datetime
from dataclasses import dataclass, field

import openpyxl

from .models import Bundesland, Membre, Sexe, StatutMembre

# Colonnes attendues dans la feuille (1ère ligne = en-têtes). Plusieurs
# libellés tolérés par colonne (casse et accents ignorés à la comparaison).
REQUIRED_COLUMNS = {
    "prenom": ("prenom", "prénom"),
    "nom": ("nom",),
    "date_naissance": ("date_naissance", "date de naissance"),
    "email": ("email", "e-mail", "mail"),
    "telephone": ("telephone", "téléphone", "tel", "tél"),
    "cin": ("cin",),
    "adresse_de": ("adresse_de", "adresse (allemagne)", "adresse"),
    "ville_de": ("ville_de", "ville (allemagne)", "ville"),
    "date_adhesion": ("date_adhesion", "date d'adhesion", "date d'adhésion"),
}
OPTIONAL_COLUMNS = {
    "sexe": ("sexe",),
    "passeport": ("passeport",),
    "code_postal_de": ("code_postal_de", "code postal"),
    "land_de": ("land_de", "land", "bundesland", "region"),
    "ville_origine_tn": ("ville_origine_tn", "ville d'origine (tunisie)", "ville d'origine"),
    "gouvernorat_tn": ("gouvernorat_tn", "gouvernorat (tunisie)", "gouvernorat"),
    "statut": ("statut",),
}
ALL_COLUMNS = {**REQUIRED_COLUMNS, **OPTIONAL_COLUMNS}

_SEXE_ALIASES = {"homme": Sexe.HOMME, "h": Sexe.HOMME, "femme": Sexe.FEMME, "f": Sexe.FEMME}
_STATUT_ALIASES = {
    "actif": StatutMembre.ACTIF,
    "en_attente": StatutMembre.EN_ATTENTE,
    "en attente": StatutMembre.EN_ATTENTE,
    "inactif": StatutMembre.INACTIF,
}
# Land : accepte le code à 2 lettres (BW, BY, ...) ou le nom complet
# (Baden-Württemberg, ...), casse ignorée.
_LAND_BY_LABEL = {label.lower(): code for code, label in Bundesland.choices}


def _normalize(value) -> str:
    return str(value).strip().lower() if value is not None else ""


@dataclass
class LigneErreur:
    ligne: int
    message: str


@dataclass
class ResultatImport:
    total: int = 0
    importes: int = 0
    ignores: int = 0
    erreurs: list = field(default_factory=list)  # list[LigneErreur]

    def as_dict(self):
        return {
            "total": self.total,
            "importes": self.importes,
            "ignores": self.ignores,
            "erreurs": [{"ligne": e.ligne, "message": e.message} for e in self.erreurs],
        }


class ImportSchemaError(Exception):
    """Le fichier n'a pas les colonnes obligatoires — rejeté avant toute lecture de ligne."""


def _map_headers(header_row) -> dict:
    """Retourne {nom_champ: index_colonne} pour les colonnes reconnues."""
    normalized = [_normalize(cell) for cell in header_row]
    mapping = {}
    for field_name, aliases in ALL_COLUMNS.items():
        for idx, header in enumerate(normalized):
            if header in aliases:
                mapping[field_name] = idx
                break

    manquantes = [f for f in REQUIRED_COLUMNS if f not in mapping]
    if manquantes:
        raise ImportSchemaError(
            "Colonnes obligatoires manquantes : " + ", ".join(sorted(manquantes))
        )
    return mapping


def _parse_date(value, champ: str) -> datetime.date:
    if isinstance(value, datetime.datetime):
        return value.date()
    if isinstance(value, datetime.date):
        return value
    if isinstance(value, str) and value.strip():
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d.%m.%Y"):
            try:
                return datetime.datetime.strptime(value.strip(), fmt).date()
            except ValueError:
                continue
    raise ValueError(f"{champ} invalide (attendu date, reçu {value!r})")


def _parse_row(row, mapping: dict, emails_vus: set, cins_vus: set) -> Membre:
    """
    Construit (sans l'enregistrer) un Membre à partir d'une ligne, ou lève
    ValueError avec un message explicite si la ligne est invalide.
    `emails_vus`/`cins_vus` : ensembles mutables des emails/CIN déjà
    rencontrés dans ce fichier — permet de détecter les doublons
    intra-fichier au fil de l'eau. Un doublon sur L'UN OU L'AUTRE (email OU
    CIN, pas nécessairement les deux à la fois) suffit à rejeter la ligne —
    voir W-008 : "valider schéma + doublons email/CIN".
    """

    def cell(field_name, required=True):
        idx = mapping.get(field_name)
        value = row[idx] if idx is not None else None
        if isinstance(value, str):
            value = value.strip()
        if required and (value is None or value == ""):
            raise ValueError(f"champ obligatoire manquant : {field_name}")
        return value

    prenom = cell("prenom")
    nom = cell("nom")
    date_naissance = _parse_date(cell("date_naissance"), "date_naissance")
    email = cell("email")
    telephone = cell("telephone")
    cin = str(cell("cin"))
    adresse_de = cell("adresse_de")
    ville_de = cell("ville_de")
    date_adhesion = _parse_date(cell("date_adhesion"), "date_adhesion")

    if "@" not in email:
        raise ValueError(f"email invalide : {email!r}")

    email_norm = email.lower()
    if email_norm in emails_vus or cin in cins_vus:
        raise ValueError(f"doublon dans le fichier (email ou CIN déjà vu) : {email}")
    emails_vus.add(email_norm)
    cins_vus.add(cin)

    sexe_brut = _normalize(cell("sexe", required=False))
    sexe = _SEXE_ALIASES.get(sexe_brut, Sexe.NON_RENSEIGNE)

    statut_brut = _normalize(cell("statut", required=False))
    # Import historique = membres déjà actifs dans l'association (pas de
    # nouvelles inscriptions à valider) — défaut ACTIF, pas EN_ATTENTE.
    statut = _STATUT_ALIASES.get(statut_brut, StatutMembre.ACTIF)

    land_brut = cell("land_de", required=False)
    land_de = ""
    if land_brut:
        land_brut_norm = _normalize(land_brut)
        land_de = (
            land_brut_norm.upper()
            if land_brut_norm.upper() in Bundesland.values
            else _LAND_BY_LABEL.get(land_brut_norm, "")
        )
        if not land_de:
            raise ValueError(f"land_de non reconnu : {land_brut!r}")

    passeport = cell("passeport", required=False) or None

    return Membre(
        prenom=prenom,
        nom=nom,
        date_naissance=date_naissance,
        sexe=sexe,
        email=email,
        telephone=str(telephone),
        cin=cin,
        passeport=passeport,
        adresse_de=adresse_de,
        code_postal_de=cell("code_postal_de", required=False) or "",
        ville_de=ville_de,
        land_de=land_de,
        ville_origine_tn=cell("ville_origine_tn", required=False) or "",
        gouvernorat_tn=cell("gouvernorat_tn", required=False) or "",
        statut=statut,
        date_adhesion=date_adhesion,
    )


def _cin_email_existants() -> tuple:
    """
    Déchiffre les cin des membres déjà en base pour la détection de doublon
    (voir limite documentée en tête de fichier : pas d'index unique possible
    sur un champ chiffré AES-256-GCM à nonce aléatoire). Retourne
    (emails_existants, cins_existants) — un doublon sur L'UN OU L'AUTRE
    suffit à rejeter une ligne d'import, pas seulement la paire exacte.
    """
    emails, cins = set(), set()
    for email, cin in Membre.objects.values_list("email", "cin"):
        # .values_list() sur un EncryptedCharField renvoie déjà la valeur
        # déchiffrée (le descriptor de champ agit aussi via le queryset ORM
        # standard ici car EncryptedCharField déchiffre à la désérialisation
        # de la valeur BDD, avant renvoi par le queryset).
        emails.add(email.lower())
        cins.add(cin)
    return emails, cins


def importer_membres(fichier) -> ResultatImport:
    """
    `fichier` : objet fichier (ex. InMemoryUploadedFile) positionné au
    début, contenant un classeur .xlsx avec une feuille de données en
    première position, 1ère ligne = en-têtes.
    """
    resultat = ResultatImport()

    try:
        classeur = openpyxl.load_workbook(fichier, read_only=True, data_only=True)
    except Exception as exc:  # openpyxl lève plusieurs types selon le problème
        raise ImportSchemaError(f"Fichier Excel illisible : {exc}") from exc

    feuille = classeur.worksheets[0]
    lignes = feuille.iter_rows(values_only=True)
    try:
        entetes = next(lignes)
    except StopIteration:
        raise ImportSchemaError("Le fichier est vide.")

    mapping = _map_headers(entetes)
    emails_vus_fichier, cins_vus_fichier = set(), set()
    emails_existants, cins_existants = _cin_email_existants()

    a_creer = []
    for numero_ligne, row in enumerate(lignes, start=2):  # ligne 1 = en-têtes
        if row is None or all(c is None for c in row):
            continue  # ligne vide — ignorée silencieusement, pas une erreur
        resultat.total += 1
        try:
            membre = _parse_row(row, mapping, emails_vus_fichier, cins_vus_fichier)
            if membre.email.lower() in emails_existants or membre.cin in cins_existants:
                raise ValueError("doublon avec un membre déjà en base (email ou CIN)")
        except ValueError as exc:
            resultat.erreurs.append(LigneErreur(ligne=numero_ligne, message=str(exc)))
            resultat.ignores += 1
            continue
        a_creer.append(membre)

    # Sauvegarde ligne par ligne (pas bulk_create) : Membre.save() génère
    # numero_membre via une requête BDD (CA-<année>-<compteur>) — nécessite
    # le cycle normal save(), voir apps.membres.models._generate_numero_membre.
    for membre in a_creer:
        membre.save()
        resultat.importes += 1

    return resultat

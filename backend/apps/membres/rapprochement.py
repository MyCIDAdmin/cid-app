"""
Rapprochement (Zuordnung) entre une fiche Membre IMPORTÉE (sans compte, voir
apps.membres.imports) et le compte/fiche créés quand le membre s'inscrit lui-même.

Problème résolu : RegisterSerializer.create crée TOUJOURS une nouvelle fiche Membre
(statut en_attente). Sans rapprochement, un membre importé qui s'inscrit après coup aurait
deux fiches (doublon) : l'importée (historique, numéro, statut) et la nouvelle (compte).

Règles (décision utilisateur, 2026-10-07) :
  - Critères évalués : email, CIN (si renseigné), nom + prénom (+ date de naissance en bonus).
    Le meilleur résultat compte (voir `evaluer`).
  - Liaison AUTOMATIQUE uniquement sur un email exact et unique, au moment où l'email vient
    d'être confirmé par code (RegisterConfirmView) — l'email est donc prouvé. CIN et nom sont
    saisis librement à l'inscription, donc jamais suffisants seuls pour une liaison
    automatique (sinon il suffirait de taper le CIN d'autrui pour reprendre sa fiche) : ils
    ne produisent qu'une SUGGESTION avec un score, à confirmer par RH/Admin.
  - Après liaison, la fiche importée est conservée (numéro, statut, date d'adhésion,
    historique) mais les données personnelles saisies par le membre à l'inscription
    ÉCRASENT celles de l'import (décision utilisateur, 2026-10-07) : c'est lui qui connaît ses
    données actuelles. Un champ laissé vide à l'inscription n'efface jamais la valeur importée.
"""

import difflib
import logging
import unicodedata
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction

from .models import CIN_PLATZHALTER, Membre, Sexe

logger = logging.getLogger(__name__)

SEUIL_SUGGESTION = 40
SCORE_EMAIL = 100
SCORE_CIN = 90
SCORE_NOM_EXACT = 60
SCORE_NOM_PROCHE = 40
BONUS_DATE_NAISSANCE = 25
BONUS_CRITERE_SUPPLEMENTAIRE = 5
SEUIL_NOM_PROCHE = 0.88

# Données personnelles saisies par le membre à l'inscription : elles remplacent celles de la
# fiche importée lors d'une liaison (sauf si laissées vides). Jamais : numero_membre, statut,
# date_adhesion, historique — ils restent ceux de la fiche importée.
_CHAMPS_SAISIE_UTILISATEUR = (
    "prenom",
    "nom",
    "date_naissance",
    "sexe",
    "cin",
    "passeport",
    "telephone",
    "adresse_de",
    "code_postal_de",
    "ville_de",
    "land_de",
    "ville_origine_tn",
    "gouvernorat_tn",
)


class RapprochementError(Exception):
    """Liaison impossible (état incohérent ou conflit d'intégrité)."""


@dataclass
class Correspondance:
    membre: Membre
    score: int
    raisons: list = field(default_factory=list)  # ex. ["email", "cin", "nom", "date_naissance"]


def _normaliser_texte(valeur) -> str:
    """minuscules, sans accents ni ponctuation : "Éric  Ben-Ali" == "eric benali"."""
    if not valeur:
        return ""
    decompose = unicodedata.normalize("NFKD", str(valeur))
    sans_accents = "".join(c for c in decompose if not unicodedata.combining(c))
    return "".join(c for c in sans_accents.lower() if c.isalnum())


def _normaliser_cin(valeur) -> str:
    normalisee = "".join(c for c in str(valeur or "").lower() if c.isalnum())
    return "" if normalisee == CIN_PLATZHALTER else normalisee


def _nom_complet(membre: Membre) -> str:
    return _normaliser_texte(membre.prenom) + "|" + _normaliser_texte(membre.nom)


def _nom_inverse(membre: Membre) -> str:
    return _normaliser_texte(membre.nom) + "|" + _normaliser_texte(membre.prenom)


def evaluer(inscrit: Membre, importe: Membre) -> Correspondance | None:
    """
    Compare deux fiches et renvoie une Correspondance (score 0-100 + raisons), ou None si
    aucun critère ne correspond. Le score de base est celui du MEILLEUR critère (email 100,
    CIN 90, nom exact 60, nom proche 40) ; chaque critère supplémentaire ajoute 5 points et
    une date de naissance identique ajoute 25 points quand le nom correspond. Seul l'email
    peut atteindre 100 — les autres combinaisons sont plafonnées à 99.
    """
    raisons = []
    base = 0

    email_a, email_b = (inscrit.email or "").strip().lower(), (importe.email or "").strip().lower()
    if email_a and email_a == email_b:
        raisons.append("email")
        base = max(base, SCORE_EMAIL)

    cin_a, cin_b = _normaliser_cin(inscrit.cin), _normaliser_cin(importe.cin)
    if cin_a and cin_a == cin_b:
        raisons.append("cin")
        base = max(base, SCORE_CIN)

    nom_match = False
    complet_a = _nom_complet(inscrit)
    if complet_a != "|" and complet_a in (_nom_complet(importe), _nom_inverse(importe)):
        raisons.append("nom")
        nom_match = True
        base = max(base, SCORE_NOM_EXACT)
    elif complet_a != "|":
        ratio = max(
            difflib.SequenceMatcher(None, complet_a, _nom_complet(importe)).ratio(),
            difflib.SequenceMatcher(None, complet_a, _nom_inverse(importe)).ratio(),
        )
        if ratio >= SEUIL_NOM_PROCHE:
            raisons.append("nom_proche")
            nom_match = True
            base = max(base, SCORE_NOM_PROCHE)

    if not raisons:
        return None

    score = base + BONUS_CRITERE_SUPPLEMENTAIRE * (len(raisons) - 1)
    if nom_match and inscrit.date_naissance and inscrit.date_naissance == importe.date_naissance:
        raisons.append("date_naissance")
        score += BONUS_DATE_NAISSANCE
    if "email" not in raisons:
        score = min(score, 99)
    return Correspondance(membre=importe, score=min(score, 100), raisons=raisons)


def fiches_importees_sans_compte(exclure_id=None):
    """Fiches sans compte de connexion (import Excel) — candidates à une liaison."""
    qs = Membre.objects.filter(user__isnull=True)
    if exclure_id is not None:
        qs = qs.exclude(pk=exclure_id)
    return list(qs)


def candidats_pour(inscrit: Membre, importes=None, seuil=SEUIL_SUGGESTION, limite=5) -> list:
    """Correspondances triées par score décroissant (>= seuil), au plus `limite`."""
    if importes is None:
        importes = fiches_importees_sans_compte(exclure_id=inscrit.pk)
    resultats = []
    for importe in importes:
        correspondance = evaluer(inscrit, importe)
        if correspondance and correspondance.score >= seuil:
            resultats.append(correspondance)
    resultats.sort(key=lambda c: (-c.score, c.membre.nom, c.membre.prenom))
    return resultats[:limite]


def inscrits_a_rapprocher(seuil=SEUIL_SUGGESTION, limite_candidats=5) -> list:
    """
    [(fiche_inscrite, [Correspondance, ...])] pour chaque fiche liée à un compte, non écartée
    par RH/Admin, qui a au moins un candidat sans compte >= seuil. Trié par meilleur score.
    """
    importes = fiches_importees_sans_compte()
    if not importes:
        return []
    resultats = []
    inscrits = Membre.objects.filter(user__isnull=False, rapprochement_ecarte=False).select_related(
        "user"
    )
    for inscrit in inscrits:
        candidats = candidats_pour(inscrit, importes, seuil=seuil, limite=limite_candidats)
        if candidats:
            resultats.append((inscrit, candidats))
    resultats.sort(key=lambda t: -t[1][0].score)
    return resultats


def fusionner(inscrit: Membre, importe: Membre) -> Membre:
    """
    Rattache le compte de `inscrit` à la fiche `importe`, reprend sur celle-ci les données
    personnelles saisies par le membre (non vides), puis supprime la fiche d'inscription
    (devenue doublon). Tout ce qui pointait déjà vers `inscrit` (commandes, likes, historique de
    statut...) est reporté sur `importe`. Renvoie la fiche conservée.
    """
    if inscrit.pk == importe.pk:
        raise RapprochementError("Une fiche ne peut pas être rapprochée d'elle-même.")
    if inscrit.user_id is None:
        raise RapprochementError("La fiche d'inscription n'est liée à aucun compte.")
    if importe.user_id is not None:
        raise RapprochementError("La fiche importée est déjà liée à un compte.")

    try:
        with transaction.atomic():
            user = inscrit.user

            # OneToOne user : libérer le compte avant de le réaffecter.
            inscrit.user = None
            inscrit.save(update_fields=["user", "updated_at"])

            # L'historique de statut est unique par (membre, année) — la fiche importée fait
            # foi (données historiques réelles) : on ne reporte que les années manquantes.
            annees_importe = set(importe.historique_statuts.values_list("annee", flat=True))
            inscrit.historique_statuts.filter(annee__in=annees_importe).delete()

            for relation in Membre._meta.related_objects:
                if relation.related_model is Membre or not relation.one_to_many:
                    continue
                relation.related_model._default_manager.filter(
                    **{relation.field.name: inscrit}
                ).update(**{relation.field.name: importe})

            champs = ["user", "email", "updated_at"]
            importe.user = user
            importe.email = user.email
            for nom_champ in _CHAMPS_SAISIE_UTILISATEUR:
                valeur = getattr(inscrit, nom_champ)
                if valeur and valeur != Sexe.NON_RENSEIGNE:
                    setattr(importe, nom_champ, valeur)
                    champs.append(nom_champ)
            if not importe.photo and inscrit.photo:
                importe.photo = inscrit.photo.name
                champs.append("photo")
            importe.save(update_fields=champs)

            inscrit.delete()
    except IntegrityError as exc:
        raise RapprochementError(f"Conflit lors de la fusion : {exc}") from exc

    logger.info("rapprochement: compte %s lié à la fiche %s", user.pk, importe.numero_membre)
    return importe


def lier_automatiquement(inscrit: Membre) -> Membre | None:
    """
    Liaison automatique après confirmation de l'email : si UNE SEULE fiche sans compte porte
    le même email (insensible à la casse), elle est fusionnée avec la fiche d'inscription.
    Plusieurs fiches avec cet email = ambigu -> aucune liaison automatique (suggestions RH).
    Renvoie la fiche conservée ou None.
    """
    email = (inscrit.email or "").strip()
    if not email:
        return None
    trouvees = list(
        Membre.objects.filter(user__isnull=True, email__iexact=email).exclude(pk=inscrit.pk)[:2]
    )
    if len(trouvees) != 1:
        return None
    try:
        return fusionner(inscrit, trouvees[0])
    except RapprochementError:
        logger.exception("rapprochement automatique impossible pour %s", inscrit.pk)
        return None

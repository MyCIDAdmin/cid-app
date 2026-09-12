"""
Agrégations — app stats (Phase 2B, FDD §5.3 : 3 onglets R1 — Financier, Membres, Événements ;
Engagement/Projets restent R2, hors périmètre ici comme dans CID-RPL-001 §2.2).

Pas de modèle propre à ce module (voir models.py) : chaque fonction interroge les modèles
existants (cotisations, adhesions, boutique, evenements, membres) et retourne un dict JSON-able,
consommé tel quel par les vues (views.py) et par les 3 onglets React (Phase 2B, tâche frontend
séparée — voir CLAUDE.md §7).

Filtres communs aux 3 onglets (mockup #pg-stats, filter-bar) :
  - annee : filtre "Période" (par défaut l'année en cours). Chaque agrégat filtre sur la date qui
    a un sens pour lui (date_paiement pour les cotisations/souscriptions déjà payées, created_at
    pour les commandes, date_evenement pour les événements) plutôt que sur un champ "année"
    unique qui n'existe que sur Cotisation.
  - ville : filtre "Ville DE" — Membre.ville_de (ou, pour les événements, aucun filtre pertinent
    au niveau de l'événement lui-même, appliqué uniquement aux inscriptions/membres).
  - statut : filtre "Statut" — Membre.statut (actif/en_attente/inactif).

Dépenses : aucun module de suivi des dépenses n'existe encore dans ce projet (seul F-015
"Ajouter une transaction (DG)" existe, et Cotisation ne modélise que des recettes) — `depenses`
est donc toujours à 0 pour l'instant, documenté explicitement plutôt que masqué, en attendant un
futur module de comptabilité.

Répartition professionnelle (FDD §5.3, onglet Membres) : `Membre` ne porte pas de champ
`profession` — cet indicateur est volontairement omis plutôt que fondé sur une donnée qui
n'existe pas ; il pourra être ajouté si/quand ce champ est introduit dans apps.membres.
"""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from apps.adhesions.models import Souscription, StatutSouscription
from apps.boutique.models import Commande, StatutCommande
from apps.cotisations.models import MONTANTS_CATALOGUE, Cotisation, StatutCotisation, TypeArticle
from apps.evenements.models import Evenement, Inscription, StatutEvenement, StatutInscription
from apps.membres.models import Membre, StatutMembre

# Tranches de la pyramide des âges (mockup #st-membres) — bornes inclusives en années.
TRANCHES_AGE = [(18, 25), (26, 35), (36, 45), (46, 55), (56, None)]


def _annee_ou_courante(annee):
    return annee or timezone.now().year


def _filtrer_par_membre(queryset, prefix, ville, statut):
    if ville:
        queryset = queryset.filter(**{f"{prefix}__ville_de": ville})
    if statut:
        queryset = queryset.filter(**{f"{prefix}__statut": statut})
    return queryset


def kpis_financier(*, annee=None, ville=None, statut=None) -> dict:
    """FDD §5.3 — Solde, recettes, dépenses, taux collecte, cotisations en attente, revenus
    boutique, revenus adhésions, top contributeurs."""
    annee = _annee_ou_courante(annee)

    cotisations_payees = _filtrer_par_membre(
        Cotisation.objects.filter(statut=StatutCotisation.PAYEE, date_paiement__year=annee),
        "membre",
        ville,
        statut,
    )
    recettes_cotisations = cotisations_payees.filter(type_article=TypeArticle.COTISATION).aggregate(
        t=Sum("montant")
    )["t"] or Decimal("0.00")
    revenus_dons = cotisations_payees.filter(type_article=TypeArticle.DON).aggregate(
        t=Sum("montant")
    )["t"] or Decimal("0.00")

    souscriptions_payees = _filtrer_par_membre(
        Souscription.objects.filter(statut=StatutSouscription.PAYEE, date_souscription__year=annee),
        "membre",
        ville,
        statut,
    )
    revenus_adhesions = souscriptions_payees.aggregate(t=Sum("prix_paye"))["t"] or Decimal("0.00")

    commandes = _filtrer_par_membre(
        Commande.objects.filter(created_at__year=annee).exclude(
            statut__in=[StatutCommande.ANNULEE, StatutCommande.REMBOURSEE]
        ),
        "membre",
        ville,
        statut,
    )
    revenus_boutique = commandes.aggregate(t=Sum("montant_total"))["t"] or Decimal("0.00")

    inscriptions_payantes = _filtrer_par_membre(
        Inscription.objects.filter(evenement__date_evenement__year=annee).exclude(
            statut=StatutInscription.ANNULEE
        ),
        "membre",
        ville,
        statut,
    )
    revenus_evenements = inscriptions_payantes.aggregate(t=Sum("montant_paye"))["t"] or Decimal(
        "0.00"
    )

    depenses = Decimal("0.00")  # voir docstring de module
    recettes = (
        recettes_cotisations
        + revenus_dons
        + revenus_adhesions
        + revenus_boutique
        + revenus_evenements
    )
    solde = recettes - depenses

    membres_actifs = Membre.objects.filter(statut=StatutMembre.ACTIF)
    if ville:
        membres_actifs = membres_actifs.filter(ville_de=ville)
    montant_attendu = membres_actifs.count() * MONTANTS_CATALOGUE[TypeArticle.COTISATION]
    taux_collecte = (
        round(float(recettes_cotisations) / float(montant_attendu) * 100, 1)
        if montant_attendu
        else 0.0
    )

    cotisations_en_attente = _filtrer_par_membre(
        Cotisation.objects.filter(
            type_article=TypeArticle.COTISATION, statut=StatutCotisation.EN_ATTENTE, annee=annee
        ),
        "membre",
        ville,
        statut,
    ).aggregate(t=Sum("montant"))["t"] or Decimal("0.00")

    return {
        "annee": annee,
        "solde": solde,
        "recettes": recettes,
        "depenses": depenses,
        "taux_collecte": taux_collecte,
        "cotisations_en_attente": cotisations_en_attente,
        "revenus_boutique": revenus_boutique,
        "revenus_adhesions": revenus_adhesions,
        "revenus_evenements": revenus_evenements,
        "top_contributeurs": _top_contributeurs(annee, ville, statut),
    }


def _top_contributeurs(annee, ville, statut, limite=5) -> list:
    totaux = defaultdict(
        lambda: {
            "membre": None,
            "cotisations": Decimal("0"),
            "evenements": Decimal("0"),
            "dons": Decimal("0"),
        }
    )

    cotisations = _filtrer_par_membre(
        Cotisation.objects.filter(
            statut=StatutCotisation.PAYEE,
            date_paiement__year=annee,
            type_article__in=[TypeArticle.COTISATION, TypeArticle.DON],
        ).select_related("membre"),
        "membre",
        ville,
        statut,
    )
    for cotisation in cotisations:
        entree = totaux[cotisation.membre_id]
        entree["membre"] = cotisation.membre
        cle = "cotisations" if cotisation.type_article == TypeArticle.COTISATION else "dons"
        entree[cle] += cotisation.montant

    inscriptions = _filtrer_par_membre(
        Inscription.objects.filter(evenement__date_evenement__year=annee)
        .exclude(statut=StatutInscription.ANNULEE)
        .select_related("membre"),
        "membre",
        ville,
        statut,
    )
    for inscription in inscriptions:
        entree = totaux[inscription.membre_id]
        entree["membre"] = inscription.membre
        entree["evenements"] += inscription.montant_paye

    classement = []
    for donnees in totaux.values():
        total = donnees["cotisations"] + donnees["evenements"] + donnees["dons"]
        if total <= 0:
            continue
        membre = donnees["membre"]
        classement.append(
            {
                "membre_id": str(membre.id),
                "nom": f"{membre.prenom} {membre.nom}",
                "cotisations": donnees["cotisations"],
                "evenements": donnees["evenements"],
                "dons": donnees["dons"],
                "total": total,
            }
        )
    classement.sort(key=lambda ligne: ligne["total"], reverse=True)
    return classement[:limite]


def kpis_membres(*, ville=None, statut=None) -> dict:
    """FDD §5.3 — Total, actifs/inactifs, répartition ville, pyramide âges (répartition
    professionnelle omise, voir docstring de module)."""
    membres = Membre.objects.all()
    if ville:
        membres = membres.filter(ville_de=ville)
    if statut:
        membres = membres.filter(statut=statut)

    total = membres.count()
    actifs = membres.filter(statut=StatutMembre.ACTIF).count()

    par_ville = list(
        membres.exclude(ville_de="")
        .values("ville_de")
        .annotate(nombre=Count("id"))
        .order_by("-nombre")
    )

    aujourd_hui = timezone.now().date()
    pyramide_ages = []
    for age_min, age_max in TRANCHES_AGE:
        date_naissance_max = aujourd_hui.replace(year=aujourd_hui.year - age_min)
        if age_max is None:
            nombre = membres.filter(date_naissance__lte=date_naissance_max).count()
            label = f"{age_min}+ ans"
        else:
            date_naissance_min = aujourd_hui.replace(
                year=aujourd_hui.year - age_max - 1
            ) + timedelta(days=1)
            nombre = membres.filter(
                date_naissance__gt=date_naissance_min, date_naissance__lte=date_naissance_max
            ).count()
            label = f"{age_min}–{age_max} ans"
        pyramide_ages.append({"tranche": label, "nombre": nombre})

    return {
        "total": total,
        "actifs": actifs,
        "inactifs": total - actifs,
        "par_ville": par_ville,
        "pyramide_ages": pyramide_ages,
    }


def kpis_evenements(*, annee=None, ville=None, statut=None) -> dict:
    """FDD §5.3 — Taux de remplissage, inscriptions, revenus, répartition par type."""
    annee = _annee_ou_courante(annee)

    evenements = Evenement.objects.filter(date_evenement__year=annee).exclude(
        statut=StatutEvenement.BROUILLON
    )
    nombre_evenements = evenements.count()

    inscriptions = _filtrer_par_membre(
        Inscription.objects.filter(evenement__in=evenements).exclude(
            statut=StatutInscription.ANNULEE
        ),
        "membre",
        ville,
        statut,
    )
    inscriptions_totales = inscriptions.aggregate(t=Sum("places"))["t"] or 0
    revenus = inscriptions.aggregate(t=Sum("montant_paye"))["t"] or Decimal("0.00")

    evenements_avec_capacite = [e for e in evenements if e.places_max]
    if evenements_avec_capacite:
        taux_remplissage_moyen = round(
            sum(e.places_reservees / e.places_max for e in evenements_avec_capacite)
            / len(evenements_avec_capacite)
            * 100,
            1,
        )
    else:
        taux_remplissage_moyen = 0.0

    par_type = list(
        evenements.values("type_evenement").annotate(nombre=Count("id")).order_by("-nombre")
    )
    participation_par_evenement = [
        {
            "id": str(evenement.id),
            "titre": evenement.titre,
            "places_reservees": evenement.places_reservees,
            "places_max": evenement.places_max,
        }
        for evenement in evenements
    ]

    return {
        "annee": annee,
        "nombre_evenements": nombre_evenements,
        "taux_remplissage_moyen": taux_remplissage_moyen,
        "inscriptions_totales": inscriptions_totales,
        "revenus": revenus,
        "par_type": par_type,
        "participation_par_evenement": participation_par_evenement,
    }

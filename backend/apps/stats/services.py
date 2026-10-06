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
  - land : filtre "Bundesland" — Membre.land_de (ajouté le 2026-09-19, demande utilisateur :
    "Bei ... Statistiken & KPIs füge mehr Filtermöglichten hinzu z.B. Bundesland").
  - pays : filtre "Pays de résidence" — Membre.pays (ajouté le 2026-09-19, même demande).
  - date_adhesion_apres / date_adhesion_avant : bornes (incluses) sur Membre.date_adhesion
    (ajouté le 2026-09-19, même demande).

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
from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle, montant_catalogue
from apps.evenements.models import Evenement, Inscription, StatutEvenement, StatutInscription
from apps.finances.models import Depense, StatutDepense
from apps.membres.models import Membre, StatutMembre
from apps.projets.models import Aufgabe, PlanKosten, Projet, ProjetMitglied, StatutAufgabe

from .bilan import total_depenses

# Types de transaction exposés par finances_liste() (onglet "Finanzdaten", module "Statistiken &
# KPIs", demande utilisateur du 2026-09-25 : "Tab für alle Finanzdaten (filterbar/sortierbar)").
# Traduits côté frontend (finances.type_<valeur>), même convention que type_evenement.
TYPE_TRANSACTION_COTISATION = "cotisation"
TYPE_TRANSACTION_DON = "don"
TYPE_TRANSACTION_ADHESION = "adhesion"
TYPE_TRANSACTION_EVENEMENT = "evenement"
TYPE_TRANSACTION_BOUTIQUE = "boutique"
TYPE_TRANSACTION_AUTRE = "autre"
TYPE_TRANSACTION_PROJET = "projet"
TYPE_TRANSACTION_DEPENSE = "depense"
TYPES_TRANSACTION = {
    TYPE_TRANSACTION_COTISATION,
    TYPE_TRANSACTION_DON,
    TYPE_TRANSACTION_ADHESION,
    TYPE_TRANSACTION_EVENEMENT,
    TYPE_TRANSACTION_BOUTIQUE,
    TYPE_TRANSACTION_AUTRE,
    TYPE_TRANSACTION_PROJET,
    TYPE_TRANSACTION_DEPENSE,
}
_CHAMPS_TRI_FINANCES = {"date", "montant", "membre_nom", "type", "statut"}

# Tranches de la pyramide des âges (mockup #st-membres) — bornes inclusives en années.
TRANCHES_AGE = [(18, 25), (26, 35), (36, 45), (46, 55), (56, None)]


def _annee_ou_courante(annee):
    return annee or timezone.now().year


def _filtrer_par_membre(
    queryset,
    prefix,
    ville,
    statut,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
):
    if ville:
        queryset = queryset.filter(**{f"{prefix}__ville_de": ville})
    if statut:
        queryset = queryset.filter(**{f"{prefix}__statut": statut})
    if land:
        queryset = queryset.filter(**{f"{prefix}__land_de": land})
    if pays:
        queryset = queryset.filter(**{f"{prefix}__pays": pays})
    if date_adhesion_apres:
        queryset = queryset.filter(**{f"{prefix}__date_adhesion__gte": date_adhesion_apres})
    if date_adhesion_avant:
        queryset = queryset.filter(**{f"{prefix}__date_adhesion__lte": date_adhesion_avant})
    return queryset


def kpis_financier(
    *,
    annee=None,
    ville=None,
    statut=None,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
) -> dict:
    """FDD §5.3 — Solde, recettes, dépenses, taux collecte, cotisations en attente, revenus
    boutique, revenus adhésions, top contributeurs."""
    annee = _annee_ou_courante(annee)
    filtres_membre = {
        "land": land,
        "pays": pays,
        "date_adhesion_apres": date_adhesion_apres,
        "date_adhesion_avant": date_adhesion_avant,
    }

    cotisations_payees = _filtrer_par_membre(
        Cotisation.objects.filter(statut=StatutCotisation.PAYEE, date_paiement__year=annee),
        "membre",
        ville,
        statut,
        **filtres_membre,
    )
    recettes_cotisations = cotisations_payees.filter(type_article=TypeArticle.COTISATION).aggregate(
        t=Sum("montant")
    )["t"] or Decimal("0.00")
    revenus_dons = cotisations_payees.filter(type_article=TypeArticle.DON).aggregate(
        t=Sum("montant")
    )["t"] or Decimal("0.00")
    revenus_projets = cotisations_payees.filter(type_article=TypeArticle.PROJET).aggregate(
        t=Sum("montant")
    )["t"] or Decimal("0.00")

    souscriptions_payees = _filtrer_par_membre(
        Souscription.objects.filter(statut=StatutSouscription.PAYEE, date_souscription__year=annee),
        "membre",
        ville,
        statut,
        **filtres_membre,
    )
    revenus_adhesions = souscriptions_payees.aggregate(t=Sum("prix_paye"))["t"] or Decimal("0.00")

    commandes = _filtrer_par_membre(
        Commande.objects.filter(created_at__year=annee).exclude(
            statut__in=[StatutCommande.ANNULEE, StatutCommande.REMBOURSEE]
        ),
        "membre",
        ville,
        statut,
        **filtres_membre,
    )
    revenus_boutique = commandes.aggregate(t=Sum("montant_total"))["t"] or Decimal("0.00")

    inscriptions_payantes = _filtrer_par_membre(
        Inscription.objects.filter(evenement__date_evenement__year=annee).exclude(
            statut=StatutInscription.ANNULEE
        ),
        "membre",
        ville,
        statut,
        **filtres_membre,
    )
    revenus_evenements = inscriptions_payantes.aggregate(t=Sum("montant_paye"))["t"] or Decimal(
        "0.00"
    )

    depenses = total_depenses(annee)  # dépenses APPROUVÉES (apps.finances), voir bilan.py
    recettes = (
        recettes_cotisations
        + revenus_dons
        + revenus_projets
        + revenus_adhesions
        + revenus_boutique
        + revenus_evenements
    )
    solde = recettes - depenses

    membres_actifs = Membre.objects.filter(statut=StatutMembre.ACTIF)
    if ville:
        membres_actifs = membres_actifs.filter(ville_de=ville)
    if land:
        membres_actifs = membres_actifs.filter(land_de=land)
    if pays:
        membres_actifs = membres_actifs.filter(pays=pays)
    if date_adhesion_apres:
        membres_actifs = membres_actifs.filter(date_adhesion__gte=date_adhesion_apres)
    if date_adhesion_avant:
        membres_actifs = membres_actifs.filter(date_adhesion__lte=date_adhesion_avant)
    # Ajouté le 2026-09-17 : suit désormais le tarif couramment configuré par l'Administrateur App
    # (voir apps.cotisations.models.montant_catalogue), plutôt qu'un dict figé.
    montant_attendu = membres_actifs.count() * montant_catalogue(TypeArticle.COTISATION)
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
        **filtres_membre,
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
        "revenus_projets": revenus_projets,
        "top_contributeurs": _top_contributeurs(annee, ville, statut, **filtres_membre),
    }


def _top_contributeurs(
    annee,
    ville,
    statut,
    limite=5,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
) -> list:
    totaux = defaultdict(
        lambda: {
            "membre": None,
            "cotisations": Decimal("0"),
            "evenements": Decimal("0"),
            "dons": Decimal("0"),
        }
    )
    filtres_membre = {
        "land": land,
        "pays": pays,
        "date_adhesion_apres": date_adhesion_apres,
        "date_adhesion_avant": date_adhesion_avant,
    }

    cotisations = _filtrer_par_membre(
        Cotisation.objects.filter(
            statut=StatutCotisation.PAYEE,
            date_paiement__year=annee,
            type_article__in=[TypeArticle.COTISATION, TypeArticle.DON],
        ).select_related("membre"),
        "membre",
        ville,
        statut,
        **filtres_membre,
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
        **filtres_membre,
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


def kpis_membres(
    *,
    ville=None,
    statut=None,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
) -> dict:
    """FDD §5.3 — Total, actifs/inactifs, répartition ville, pyramide âges (répartition
    professionnelle omise, voir docstring de module)."""
    membres = Membre.objects.all()
    if ville:
        membres = membres.filter(ville_de=ville)
    if statut:
        membres = membres.filter(statut=statut)
    if land:
        membres = membres.filter(land_de=land)
    if pays:
        membres = membres.filter(pays=pays)
    if date_adhesion_apres:
        membres = membres.filter(date_adhesion__gte=date_adhesion_apres)
    if date_adhesion_avant:
        membres = membres.filter(date_adhesion__lte=date_adhesion_avant)

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


def kpis_evenements(
    *,
    annee=None,
    ville=None,
    statut=None,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
) -> dict:
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
        land=land,
        pays=pays,
        date_adhesion_apres=date_adhesion_apres,
        date_adhesion_avant=date_adhesion_avant,
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


def finances_liste(
    *,
    annee=None,
    type_transaction=None,
    ville=None,
    statut=None,
    land=None,
    pays=None,
    date_adhesion_apres=None,
    date_adhesion_avant=None,
    tri="date",
    ordre="desc",
    mois=None,
) -> list:
    """
    Onglet "Finanzdaten" (module "Statistiken & KPIs", demande utilisateur du 2026-09-25 :
    "Tab für alle Finanzdaten (filterbar/sortierbar)") — registre unifié de TOUTES les écritures
    financières individuelles, quel que soit leur statut (payée, en attente, annulée...) :
    contrairement à kpis_financier ci-dessus (qui n'agrège que les montants déjà encaissés), ici
    chaque ligne reste visible pour donner une vue d'audit complète.

    Source canonique par type, exactement comme kpis_financier, pour ne jamais compter deux fois
    la même transaction : une Inscription payante et une Souscription payée génèrent chacune leur
    propre Cotisation liée (voir apps.evenements.services.synchroniser_cotisation /
    Souscription.cotisation) — Cotisation(type_article=EVENEMENT/ADHESION) est donc volontairement
    EXCLUE ici, ces lignes provenant uniquement d'Inscription/Souscription. Les types cotisation/
    don/autre/projet n'ont pas de modèle source alternatif : ils viennent bien de Cotisation.

    `tri` ∈ {date, montant, membre_nom, type, statut} (défaut "date"), `ordre` ∈ {asc, desc}
    (défaut "desc") — tri effectué en Python, les lignes provenant de 4 modèles distincts.
    """
    annee = _annee_ou_courante(annee)
    filtres_membre = {
        "land": land,
        "pays": pays,
        "date_adhesion_apres": date_adhesion_apres,
        "date_adhesion_avant": date_adhesion_avant,
    }
    lignes = []

    def _ajoute(
        type_transaction_ligne, obj_id, date_valeur, membre, description, montant, statut_ligne
    ):
        if membre is None:
            return
        lignes.append(
            {
                # Préfixé par le type : les UUID sont propres à chaque table, mais un préfixe
                # évite toute ambiguïté si jamais deux tables généraient la même valeur.
                "id": f"{type_transaction_ligne}:{obj_id}",
                "type": type_transaction_ligne,
                "date": date_valeur,
                "membre_id": str(membre.id),
                "membre_nom": f"{membre.prenom} {membre.nom}",
                "description": description,
                "montant": montant,
                "statut": statut_ligne,
            }
        )

    _TYPE_ARTICLE_VERS_TRANSACTION = {
        TypeArticle.COTISATION: TYPE_TRANSACTION_COTISATION,
        TypeArticle.DON: TYPE_TRANSACTION_DON,
        TypeArticle.AUTRE: TYPE_TRANSACTION_AUTRE,
        TypeArticle.AUTRE_LIBRE: TYPE_TRANSACTION_AUTRE,
        TypeArticle.PROJET: TYPE_TRANSACTION_PROJET,
    }

    if type_transaction is None or type_transaction in _TYPE_ARTICLE_VERS_TRANSACTION.values():
        types_article_recherches = [
            type_article
            for type_article, transaction in _TYPE_ARTICLE_VERS_TRANSACTION.items()
            if type_transaction is None or transaction == type_transaction
        ]
        cotisations = _filtrer_par_membre(
            Cotisation.objects.filter(
                type_article__in=types_article_recherches, created_at__year=annee
            ).select_related("membre"),
            "membre",
            ville,
            statut,
            **filtres_membre,
        )
        for cotisation in cotisations:
            _ajoute(
                _TYPE_ARTICLE_VERS_TRANSACTION[cotisation.type_article],
                cotisation.id,
                cotisation.created_at.date(),
                cotisation.membre,
                cotisation.libelle,
                cotisation.montant,
                cotisation.statut,
            )

    if type_transaction is None or type_transaction == TYPE_TRANSACTION_ADHESION:
        souscriptions = _filtrer_par_membre(
            Souscription.objects.filter(date_souscription__year=annee)
            .exclude(statut=StatutSouscription.BROUILLON)
            .select_related("membre", "offre"),
            "membre",
            ville,
            statut,
            **filtres_membre,
        )
        for souscription in souscriptions:
            _ajoute(
                TYPE_TRANSACTION_ADHESION,
                souscription.id,
                souscription.date_souscription.date(),
                souscription.membre,
                souscription.offre.nom,
                souscription.prix_paye,
                souscription.statut,
            )

    if type_transaction is None or type_transaction == TYPE_TRANSACTION_EVENEMENT:
        inscriptions = _filtrer_par_membre(
            Inscription.objects.filter(evenement__date_evenement__year=annee, montant_paye__gt=0)
            .exclude(statut=StatutInscription.ANNULEE)
            .select_related("membre", "evenement"),
            "membre",
            ville,
            statut,
            **filtres_membre,
        )
        for inscription in inscriptions:
            _ajoute(
                TYPE_TRANSACTION_EVENEMENT,
                inscription.id,
                inscription.evenement.date_evenement,
                inscription.membre,
                inscription.evenement.titre,
                inscription.montant_paye,
                inscription.statut,
            )

    if type_transaction is None or type_transaction == TYPE_TRANSACTION_BOUTIQUE:
        commandes = _filtrer_par_membre(
            Commande.objects.filter(created_at__year=annee)
            .exclude(statut__in=[StatutCommande.ANNULEE, StatutCommande.REMBOURSEE])
            .select_related("membre"),
            "membre",
            ville,
            statut,
            **filtres_membre,
        )
        for commande in commandes:
            _ajoute(
                TYPE_TRANSACTION_BOUTIQUE,
                commande.id,
                commande.created_at.date(),
                commande.membre,
                commande.numero_commande,
                commande.montant_total,
                commande.statut,
            )

    # Dépenses (type "depense", montant NÉGATIF, quel que soit leur statut — registre d'audit
    # complet comme les autres types). Sans pertinence quand un filtre portant sur le MEMBRE est
    # actif (ville/statut/land/pays/date d'adhésion) : une dépense n'a pas de membre.
    filtre_membre_actif = any([ville, statut, land, pays, date_adhesion_apres, date_adhesion_avant])
    if not filtre_membre_actif and type_transaction in (None, TYPE_TRANSACTION_DEPENSE):
        for dep in Depense.objects.filter(date_depense__year=annee).select_related("categorie"):
            lignes.append(
                {
                    "id": f"{TYPE_TRANSACTION_DEPENSE}:{dep.id}",
                    "type": TYPE_TRANSACTION_DEPENSE,
                    "date": dep.date_depense,
                    "membre_id": "",
                    "membre_nom": dep.fournisseur,
                    "description": dep.categorie.nom,
                    "montant": -dep.montant,
                    "statut": dep.statut,
                }
            )

    if mois:
        lignes = [ligne for ligne in lignes if ligne["date"].month == int(mois)]

    tri = tri if tri in _CHAMPS_TRI_FINANCES else "date"
    inverse = ordre != "asc"
    lignes.sort(key=lambda ligne: ligne[tri], reverse=inverse)
    return lignes


def kpis_projets() -> dict:
    """Projekt-Kennzahlen (2026-10-07) : Fortschritt der Aufgaben, Plan/Ist/Offen der Kosten und
    Ergebnis je Projekt. Ein Schnappschuss des aktuellen Stands über alle Projekte (auch Entwürfe,
    die Statistik-Seite ist ohnehin nur für die Verwaltung) — kein Jahresfilter, da Projekte und
    ihre Aufgaben über Jahre laufen. Ist = freigegebene Ausgaben, offen = noch nicht freigegeben,
    abgelehnte zählen nirgends (wie in apps.projets `kosten-uebersicht`)."""
    heute = timezone.localdate()
    null = Decimal("0.00")

    aufgaben_status = defaultdict(lambda: defaultdict(int))
    for zeile in Aufgabe.objects.values("projet_id", "status").annotate(n=Count("id")):
        aufgaben_status[zeile["projet_id"]][zeile["status"]] = zeile["n"]
    ueberfaellig = {
        z["projet_id"]: z["n"]
        for z in Aufgabe.objects.exclude(status=StatutAufgabe.ERLEDIGT)
        .filter(frist__lt=heute)
        .values("projet_id")
        .annotate(n=Count("id"))
    }
    team = {
        z["projet_id"]: z["n"]
        for z in ProjetMitglied.objects.values("projet_id").annotate(n=Count("id"))
    }
    plan = {
        z["projet_id"]: z["t"]
        for z in PlanKosten.objects.values("projet_id").annotate(t=Sum("betrag"))
    }
    ist, offen = {}, {}
    for z in (
        Depense.objects.filter(projet__isnull=False)
        .exclude(statut=StatutDepense.REJETEE)
        .values("projet_id", "statut")
        .annotate(t=Sum("montant"))
    ):
        ziel = ist if z["statut"] == StatutDepense.APPROUVEE else offen
        ziel[z["projet_id"]] = z["t"]
    einnahmen = {
        z["projet_id"]: z["t"]
        for z in Cotisation.objects.filter(
            type_article=TypeArticle.PROJET,
            statut=StatutCotisation.PAYEE,
            projet__isnull=False,
        )
        .values("projet_id")
        .annotate(t=Sum("montant"))
    }

    zeilen = []
    gesamt_aufgaben = defaultdict(int)
    for pr in Projet.objects.order_by("titre"):
        pro_status = aufgaben_status.get(pr.id, {})
        anzahl = sum(pro_status.values())
        erledigt = pro_status.get(StatutAufgabe.ERLEDIGT, 0)
        for status, n in pro_status.items():
            gesamt_aufgaben[status] += n
        z_ist, z_einnahmen = ist.get(pr.id, null), einnahmen.get(pr.id, null)
        zeilen.append(
            {
                "id": str(pr.id),
                "titre": pr.titre,
                "statut": pr.statut,
                "sichtbarkeit": pr.sichtbarkeit,
                "team": team.get(pr.id, 0),
                "aufgaben_gesamt": anzahl,
                "aufgaben_erledigt": erledigt,
                "prozent": round(100 * erledigt / anzahl) if anzahl else 0,
                "ueberfaellig": ueberfaellig.get(pr.id, 0),
                "plan": plan.get(pr.id, null),
                "ist": z_ist,
                "offen": offen.get(pr.id, null),
                "einnahmen": z_einnahmen,
                "ergebnis": z_einnahmen - z_ist,
            }
        )

    summe = lambda feld: sum((z[feld] for z in zeilen), null)  # noqa: E731
    aufgaben_gesamt = sum(gesamt_aufgaben.values())
    plan_gesamt, ist_gesamt = summe("plan"), summe("ist")
    return {
        "projekte_gesamt": len(zeilen),
        "veroeffentlicht": sum(1 for z in zeilen if z["sichtbarkeit"] == "veroeffentlicht"),
        "entwurf": sum(1 for z in zeilen if z["sichtbarkeit"] == "entwurf"),
        "nach_status": [
            {"statut": statut, "nombre": n}
            for statut, n in sorted(
                _zaehle(z["statut"] for z in zeilen).items(), key=lambda kv: -kv[1]
            )
        ],
        "aufgaben": {
            "gesamt": aufgaben_gesamt,
            "erledigt": gesamt_aufgaben.get(StatutAufgabe.ERLEDIGT, 0),
            "ueberfaellig": sum(ueberfaellig.values()),
            "quote": (
                round(100 * gesamt_aufgaben.get(StatutAufgabe.ERLEDIGT, 0) / aufgaben_gesamt)
                if aufgaben_gesamt
                else 0
            ),
            "pro_status": {code: gesamt_aufgaben.get(code, 0) for code in StatutAufgabe.values},
        },
        "kosten": {
            "plan": plan_gesamt,
            "ist": ist_gesamt,
            "offen": summe("offen"),
            "einnahmen": summe("einnahmen"),
            "ergebnis": summe("ergebnis"),
            "auslastung": round(100 * ist_gesamt / plan_gesamt) if plan_gesamt else None,
        },
        "projekte": zeilen,
    }


def _zaehle(werte) -> dict:
    zaehler: dict = defaultdict(int)
    for wert in werte:
        zaehler[wert] += 1
    return dict(zaehler)

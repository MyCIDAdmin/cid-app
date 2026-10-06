"""
Jahresbilanz, Budget vs. Ist et résultat par événement/projet (demande utilisateur du
2026-10-06 : extension du module "Statistiken & KPIs" pour le service financier).

Module volontairement autonome (n'importe pas services.py, qui l'importe) : les recettes sont
toujours calculées depuis les mêmes sources canoniques que kpis_financier — une ligne par mois,
la somme des mois donnant le total par source, pour qu'un total annuel et la courbe mensuelle ne
puissent jamais diverger. Les dépenses ne comptent qu'une fois APPROUVÉES (principe des quatre
yeux, voir apps.finances.models).
"""

from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import TruncMonth

from apps.adhesions.models import Souscription, StatutSouscription
from apps.boutique.models import Commande, StatutCommande
from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.evenements.models import Evenement, Inscription, StatutInscription
from apps.finances.models import (
    BudgetAnnuel,
    CategorieDepense,
    Depense,
    Jahresabschluss,
    StatutDepense,
)
from apps.projets.models import Projet

ZERO = Decimal("0.00")
SOURCES_RECETTES = ["cotisations", "dons", "projets", "adhesions", "boutique", "evenements"]
SEUIL_ATTENTION = Decimal("80")  # % du budget à partir duquel la ligne passe en "attention"


def _par_mois(qs, champ_date, champ_montant):
    sortie = defaultdict(lambda: ZERO)
    for ligne in qs.annotate(m=TruncMonth(champ_date)).values("m").annotate(t=Sum(champ_montant)):
        if ligne["m"] is not None:
            sortie[ligne["m"].month] += ligne["t"] or ZERO
    return sortie


def recettes_mensuelles(annee: int) -> dict:
    """{source: {mois (1-12): Decimal}} — mêmes règles que services.kpis_financier."""
    payees = Cotisation.objects.filter(statut=StatutCotisation.PAYEE, date_paiement__year=annee)

    def cotis(type_article):
        return _par_mois(payees.filter(type_article=type_article), "date_paiement", "montant")

    return {
        "cotisations": cotis(TypeArticle.COTISATION),
        "dons": cotis(TypeArticle.DON),
        "projets": cotis(TypeArticle.PROJET),
        "adhesions": _par_mois(
            Souscription.objects.filter(
                statut=StatutSouscription.PAYEE, date_souscription__year=annee
            ),
            "date_souscription",
            "prix_paye",
        ),
        "boutique": _par_mois(
            Commande.objects.filter(created_at__year=annee).exclude(
                statut__in=[StatutCommande.ANNULEE, StatutCommande.REMBOURSEE]
            ),
            "created_at",
            "montant_total",
        ),
        "evenements": _par_mois(
            Inscription.objects.filter(evenement__date_evenement__year=annee).exclude(
                statut=StatutInscription.ANNULEE
            ),
            "evenement__date_evenement",
            "montant_paye",
        ),
    }


def _depenses_approuvees(annee):
    return Depense.objects.filter(statut=StatutDepense.APPROUVEE, date_depense__year=annee)


def total_depenses(annee: int) -> Decimal:
    return _depenses_approuvees(annee).aggregate(t=Sum("montant"))["t"] or ZERO


def _depenses_par_categorie(annee):
    return {
        ligne["categorie_id"]: ligne["t"]
        for ligne in _depenses_approuvees(annee).values("categorie_id").annotate(t=Sum("montant"))
    }


def _depenses_mensuelles(annee):
    return _par_mois(_depenses_approuvees(annee), "date_depense", "montant")


def _statut_budget(budget, montant):
    if not budget:
        return "aucun"
    pct = montant / budget * 100
    if pct > 100:
        return "depasse"
    if pct >= SEUIL_ATTENTION:
        return "attention"
    return "ok"


def bilan_annuel(annee: int) -> dict:
    rec, rec_prec = recettes_mensuelles(annee), recettes_mensuelles(annee - 1)
    lignes_recettes = []
    for cle in SOURCES_RECETTES:
        montant = sum(rec[cle].values(), ZERO)
        precedent = sum(rec_prec[cle].values(), ZERO)
        lignes_recettes.append({"cle": cle, "montant": montant, "montant_precedent": precedent})
    total_rec = sum((r["montant"] for r in lignes_recettes), ZERO)
    total_rec_prec = sum((r["montant_precedent"] for r in lignes_recettes), ZERO)

    dep, dep_prec = _depenses_par_categorie(annee), _depenses_par_categorie(annee - 1)
    budgets = {b.categorie_id: b.montant for b in BudgetAnnuel.objects.filter(annee=annee)}
    lignes_depenses = []
    for cat in CategorieDepense.objects.all():
        montant = dep.get(cat.id, ZERO)
        precedent = dep_prec.get(cat.id, ZERO)
        budget = budgets.get(cat.id, ZERO)
        if not (montant or precedent or budget):
            continue
        lignes_depenses.append(
            {
                "categorie_id": str(cat.id),
                "nom": cat.nom,
                "namen": cat.namen,
                "montant": montant,
                "montant_precedent": precedent,
                "budget": budget,
                "ecart": budget - montant if budget else None,
                "pourcentage_budget": round(float(montant / budget * 100), 1) if budget else None,
                "statut_budget": _statut_budget(budget, montant),
            }
        )
    total_dep = sum((d["montant"] for d in lignes_depenses), ZERO)
    total_dep_prec = sum((d["montant_precedent"] for d in lignes_depenses), ZERO)
    budget_total = sum((d["budget"] for d in lignes_depenses), ZERO)

    dep_mois = _depenses_mensuelles(annee)
    cumul = ZERO
    mensuel = []
    for mois in range(1, 13):
        r = sum((rec[cle].get(mois, ZERO) for cle in SOURCES_RECETTES), ZERO)
        d = dep_mois.get(mois, ZERO)
        cumul += r - d
        mensuel.append({"mois": mois, "recettes": r, "depenses": d, "cumul": cumul})

    a_approuver = Depense.objects.filter(statut=StatutDepense.EN_ATTENTE, date_depense__year=annee)
    en_attente = a_approuver.aggregate(t=Sum("montant"))["t"] or ZERO
    return {
        "annee": annee,
        "recettes": {
            "lignes": lignes_recettes,
            "total": total_rec,
            "total_precedent": total_rec_prec,
        },
        "depenses": {
            "lignes": lignes_depenses,
            "total": total_dep,
            "total_precedent": total_dep_prec,
            "budget_total": budget_total,
        },
        "resultat": total_rec - total_dep,
        "resultat_precedent": total_rec_prec - total_dep_prec,
        "mensuel": mensuel,
        "depenses_en_attente": {"nombre": a_approuver.count(), "montant": en_attente},
        "abschluss": abschluss_info(annee, total_rec - total_dep),
        "resultats_evenements": resultats_evenements(annee),
        "resultats_projets": resultats_projets(annee),
    }


def resultats_evenements(annee: int) -> list:
    recettes = {
        ligne["evenement_id"]: ligne["t"]
        for ligne in Inscription.objects.filter(evenement__date_evenement__year=annee)
        .exclude(statut=StatutInscription.ANNULEE)
        .values("evenement_id")
        .annotate(t=Sum("montant_paye"))
    }
    depenses = {
        ligne["evenement_id"]: ligne["t"]
        for ligne in _depenses_approuvees(annee)
        .filter(evenement__isnull=False)
        .values("evenement_id")
        .annotate(t=Sum("montant"))
    }
    sortie = []
    for ev in Evenement.objects.filter(id__in=set(recettes) | set(depenses)).order_by(
        "date_evenement"
    ):
        r, d = recettes.get(ev.id, ZERO), depenses.get(ev.id, ZERO)
        sortie.append(
            {
                "id": str(ev.id),
                "titre": ev.titre,
                "date": ev.date_evenement,
                "recettes": r,
                "depenses": d,
                "resultat": r - d,
            }
        )
    return sortie


def resultats_projets(annee: int) -> list:
    recettes = {
        ligne["projet_id"]: ligne["t"]
        for ligne in Cotisation.objects.filter(
            type_article=TypeArticle.PROJET,
            statut=StatutCotisation.PAYEE,
            date_paiement__year=annee,
            projet__isnull=False,
        )
        .values("projet_id")
        .annotate(t=Sum("montant"))
    }
    for pr in Projet.objects.filter(historisch_betrag__gt=0):
        if pr.historisch_jahr_effektiv == annee:
            recettes[pr.id] = recettes.get(pr.id, ZERO) + pr.historisch_betrag
    depenses = {
        ligne["projet_id"]: ligne["t"]
        for ligne in _depenses_approuvees(annee)
        .filter(projet__isnull=False)
        .values("projet_id")
        .annotate(t=Sum("montant"))
    }
    sortie = []
    for pr in Projet.objects.filter(id__in=set(recettes) | set(depenses)).order_by("titre"):
        r, d = recettes.get(pr.id, ZERO), depenses.get(pr.id, ZERO)
        sortie.append(
            {"id": str(pr.id), "titre": pr.titre, "recettes": r, "depenses": d, "resultat": r - d}
        )
    return sortie


def abschluss_info(annee: int, resultat_aktuell: Decimal) -> dict:
    """Status des Jahresabschlusses + Abweichung des heutigen Ergebnisses vom eingefrorenen."""
    a = Jahresabschluss.objects.filter(annee=annee, aktiv=True).first()
    if a is None:
        return {"abgeschlossen": False}
    eingefroren = Decimal(a.snapshot.get("resultat", "0"))
    return {
        "abgeschlossen": True,
        "abgeschlossen_am": a.abgeschlossen_am,
        "resultat_eingefroren": eingefroren,
        "abweichung": resultat_aktuell - eingefroren,
    }


def ecritures_comptables(annee: int, langue: str = "de") -> list:
    """Buchungsliste des Jahres (Einnahmen + freigegebene Ausgaben) — dieselben Quellen und
    Regeln wie recettes_mensuelles/bilan_annuel, damit die Summe der Liste exakt dem Bilan
    entspricht (Steuerberater-CSV)."""
    zeilen = []

    def add(datum, typ, kategorie, beschreibung, partei, betrag, beleg, referenz):
        zeilen.append(
            {
                "datum": datum,
                "typ": typ,
                "kategorie": kategorie,
                "beschreibung": beschreibung,
                "gegenpartei": partei,
                "betrag": betrag,
                "beleg": beleg,
                "referenz": referenz,
            }
        )

    def nom(membre):
        return f"{membre.prenom} {membre.nom}" if membre else ""

    quellen = {
        TypeArticle.COTISATION: "Beiträge",
        TypeArticle.DON: "Spenden",
        TypeArticle.PROJET: "Projektbeiträge",
    }
    for c in Cotisation.objects.filter(
        statut=StatutCotisation.PAYEE, date_paiement__year=annee, type_article__in=quellen
    ).select_related("membre"):
        add(
            c.date_paiement.date(),
            "Einnahme",
            quellen[c.type_article],
            c.libelle,
            nom(c.membre),
            c.montant,
            "",
            c.reference_transaction or str(c.id),
        )
    for s in Souscription.objects.filter(
        statut=StatutSouscription.PAYEE, date_souscription__year=annee
    ).select_related("membre", "offre"):
        add(
            s.date_souscription.date(),
            "Einnahme",
            "Mitgliedschaften",
            s.offre.nom,
            nom(s.membre),
            s.prix_paye,
            "",
            str(s.id),
        )
    for cmd in (
        Commande.objects.filter(created_at__year=annee)
        .exclude(statut__in=[StatutCommande.ANNULEE, StatutCommande.REMBOURSEE])
        .select_related("membre")
    ):
        add(
            cmd.created_at.date(),
            "Einnahme",
            "Shop",
            cmd.numero_commande,
            nom(cmd.membre),
            cmd.montant_total,
            "",
            cmd.numero_commande,
        )
    for i in (
        Inscription.objects.filter(evenement__date_evenement__year=annee)
        .exclude(statut=StatutInscription.ANNULEE)
        .select_related("membre", "evenement")
    ):
        if i.montant_paye:
            add(
                i.evenement.date_evenement,
                "Einnahme",
                "Veranstaltungen",
                i.evenement.titre,
                nom(i.membre),
                i.montant_paye,
                "",
                str(i.id),
            )
    for d in _depenses_approuvees(annee).select_related("categorie"):
        add(
            d.date_depense,
            "Ausgabe",
            d.categorie.namen.get(langue) or d.categorie.nom,
            d.description or d.fournisseur,
            d.fournisseur,
            -d.montant,
            "ja" if d.justificatif else "nein",
            str(d.id),
        )
    zeilen.sort(key=lambda z: (z["datum"], z["typ"]))
    return zeilen

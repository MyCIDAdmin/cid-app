"""Tests unitaires — agrégations app stats (services.py)."""

import datetime
from decimal import Decimal

import pytest

from apps.adhesions.models import StatutSouscription
from apps.adhesions.tests.factories import SouscriptionFactory
from apps.boutique.models import StatutCommande
from apps.boutique.tests.factories import CommandeFactory
from apps.cotisations.models import ArticleCatalogue, StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.evenements.models import StatutEvenement, StatutInscription
from apps.evenements.tests.factories import EvenementFactory, InscriptionFactory
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.stats.services import kpis_evenements, kpis_financier, kpis_membres

pytestmark = pytest.mark.django_db


def _aujourdhui():
    return datetime.date.today()


# --- kpis_financier ---


def test_recettes_additionne_toutes_les_sources(settings):
    annee = _aujourdhui().year
    CotisationFactory(
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        type_article=TypeArticle.DON, statut=StatutCotisation.PAYEE, montant=Decimal("20.00")
    )
    SouscriptionFactory(statut=StatutSouscription.PAYEE, prix_paye=Decimal("50.00"))
    CommandeFactory(statut=StatutCommande.CONFIRMEE, montant_total=Decimal("30.00"))
    evenement = EvenementFactory(date_evenement=_aujourdhui())
    InscriptionFactory(evenement=evenement, montant_paye=Decimal("15.00"))

    resultat = kpis_financier(annee=annee)

    assert resultat["revenus_boutique"] == Decimal("30.00")
    assert resultat["revenus_adhesions"] == Decimal("50.00")
    assert resultat["revenus_evenements"] == Decimal("15.00")
    assert resultat["recettes"] == Decimal("160.00")  # 45 + 20 + 50 + 30 + 15
    assert resultat["solde"] == resultat["recettes"]  # dépenses toujours 0 pour l'instant


def test_commande_annulee_exclue_des_revenus_boutique():
    CommandeFactory(statut=StatutCommande.ANNULEE, montant_total=Decimal("99.00"))
    resultat = kpis_financier(annee=_aujourdhui().year)
    assert resultat["revenus_boutique"] == Decimal("0.00")


def test_cotisations_en_attente_comptees_separement():
    annee = _aujourdhui().year
    CotisationFactory(
        type_article=TypeArticle.COTISATION, statut=StatutCotisation.EN_ATTENTE, annee=annee
    )
    resultat = kpis_financier(annee=annee)
    assert resultat["cotisations_en_attente"] == Decimal("45.00")
    assert resultat["recettes"] == Decimal("0.00")  # pas encore payée, ne compte pas en recettes


def test_taux_collecte_suit_le_tarif_cotisation_configure_par_ladmin():
    # Ajouté le 2026-09-17 (retour utilisateur : le tarif cotisation doit être modifiable par
    # l'Administrateur App) — montant_attendu (dénominateur du taux de collecte) ne doit plus
    # reposer sur un dict figé mais sur apps.cotisations.models.montant_catalogue.
    annee = _aujourdhui().year
    ArticleCatalogue.objects.filter(type_fixe=TypeArticle.COTISATION).update(montant="60.00")
    # CotisationFactory crée son propre membre (statut ACTIF par défaut) — seul membre actif de
    # ce test, pour garder le calcul de montant_attendu (1 membre) simple à vérifier.
    CotisationFactory(
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("30.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee)

    # montant_attendu = 1 membre actif * 60.00 (tarif reconfiguré) = 60.00 ; recettes = 30.00.
    assert resultat["taux_collecte"] == 50.0


def test_top_contributeurs_classe_par_total_desc():
    annee = _aujourdhui().year
    membre1 = MembreFactory()
    membre2 = MembreFactory()
    CotisationFactory(
        membre=membre1,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        membre=membre2,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("200.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee)
    classement = resultat["top_contributeurs"]
    assert classement[0]["membre_id"] == str(membre2.id)
    assert classement[0]["total"] == Decimal("200.00")


def test_filtre_ville_restreint_les_recettes():
    annee = _aujourdhui().year
    membre_berlin = MembreFactory(ville_de="Berlin")
    membre_munich = MembreFactory(ville_de="Munich")
    CotisationFactory(
        membre=membre_berlin,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        membre=membre_munich,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee, ville="Berlin")
    assert resultat["recettes"] == Decimal("45.00")


# --- filtres land/pays/date_adhesion (ajoutés le 2026-09-19, demande utilisateur : "füge mehr
# Filtermöglichten hinzu z.B. Bundesland") ---


def test_filtre_land_restreint_les_recettes():
    annee = _aujourdhui().year
    membre_bayern = MembreFactory(land_de="BY")
    membre_berlin = MembreFactory(land_de="BE")
    CotisationFactory(
        membre=membre_bayern,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        membre=membre_berlin,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee, land="BY")
    assert resultat["recettes"] == Decimal("45.00")


def test_filtre_pays_restreint_les_recettes():
    annee = _aujourdhui().year
    membre_tn = MembreFactory(pays="TN")
    membre_de = MembreFactory(pays="DE")
    CotisationFactory(
        membre=membre_tn,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        membre=membre_de,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee, pays="TN")
    assert resultat["recettes"] == Decimal("45.00")


def test_filtre_date_adhesion_restreint_les_recettes():
    annee = _aujourdhui().year
    membre_ancien = MembreFactory(date_adhesion=datetime.date(2020, 1, 1))
    membre_recent = MembreFactory(date_adhesion=datetime.date(2026, 6, 1))
    CotisationFactory(
        membre=membre_ancien,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )
    CotisationFactory(
        membre=membre_recent,
        type_article=TypeArticle.COTISATION,
        statut=StatutCotisation.PAYEE,
        montant=Decimal("45.00"),
        annee=annee,
    )

    resultat = kpis_financier(annee=annee, date_adhesion_apres=datetime.date(2026, 1, 1))
    assert resultat["recettes"] == Decimal("45.00")


# --- kpis_membres ---


def test_total_et_actifs_inactifs():
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.ACTIF)
    MembreFactory(statut=StatutMembre.INACTIF)

    resultat = kpis_membres()
    assert resultat["total"] == 3
    assert resultat["actifs"] == 2
    assert resultat["inactifs"] == 1


def test_pyramide_ages_place_un_membre_dans_la_bonne_tranche():
    aujourdhui = _aujourdhui()
    naissance_30_ans = aujourdhui.replace(year=aujourdhui.year - 30)
    MembreFactory(date_naissance=naissance_30_ans)

    resultat = kpis_membres()
    tranche = next(t for t in resultat["pyramide_ages"] if t["tranche"] == "26–35 ans")
    assert tranche["nombre"] == 1


def test_repartition_par_ville():
    MembreFactory(ville_de="Berlin")
    MembreFactory(ville_de="Berlin")
    MembreFactory(ville_de="Hambourg")

    resultat = kpis_membres()
    par_ville = {ligne["ville_de"]: ligne["nombre"] for ligne in resultat["par_ville"]}
    assert par_ville["Berlin"] == 2
    assert par_ville["Hambourg"] == 1


def test_filtre_land_restreint_le_total_membres():
    MembreFactory(land_de="BY")
    MembreFactory(land_de="BY")
    MembreFactory(land_de="BE")

    resultat = kpis_membres(land="BY")
    assert resultat["total"] == 2


def test_filtre_pays_restreint_le_total_membres():
    MembreFactory(pays="TN")
    MembreFactory(pays="DE")
    MembreFactory(pays="DE")

    resultat = kpis_membres(pays="TN")
    assert resultat["total"] == 1


def test_filtre_date_adhesion_restreint_le_total_membres():
    MembreFactory(date_adhesion=datetime.date(2020, 1, 1))
    MembreFactory(date_adhesion=datetime.date(2026, 6, 1))

    resultat = kpis_membres(date_adhesion_apres=datetime.date(2026, 1, 1))
    assert resultat["total"] == 1


# --- kpis_evenements ---


def test_taux_remplissage_moyen():
    aujourdhui = _aujourdhui()
    evenement = EvenementFactory(
        statut=StatutEvenement.PUBLIE, date_evenement=aujourdhui, places_max=10
    )
    InscriptionFactory(evenement=evenement, places=8, statut=StatutInscription.CONFIRMEE)

    resultat = kpis_evenements(annee=aujourdhui.year)
    assert resultat["taux_remplissage_moyen"] == 80.0
    assert resultat["nombre_evenements"] == 1


def test_inscriptions_annulees_exclues_des_revenus():
    aujourdhui = _aujourdhui()
    evenement = EvenementFactory(statut=StatutEvenement.PUBLIE, date_evenement=aujourdhui)
    InscriptionFactory(
        evenement=evenement,
        montant_paye=Decimal("35.00"),
        statut=StatutInscription.ANNULEE,
    )

    resultat = kpis_evenements(annee=aujourdhui.year)
    assert resultat["revenus"] == Decimal("0.00")


def test_repartition_par_type():
    aujourdhui = _aujourdhui()
    EvenementFactory(
        statut=StatutEvenement.PUBLIE, date_evenement=aujourdhui, type_evenement="fete"
    )
    EvenementFactory(
        statut=StatutEvenement.PUBLIE, date_evenement=aujourdhui, type_evenement="fete"
    )
    EvenementFactory(
        statut=StatutEvenement.PUBLIE, date_evenement=aujourdhui, type_evenement="tournoi"
    )

    resultat = kpis_evenements(annee=aujourdhui.year)
    par_type = {ligne["type_evenement"]: ligne["nombre"] for ligne in resultat["par_type"]}
    assert par_type["fete"] == 2
    assert par_type["tournoi"] == 1

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.boutique.models import (
    BonAchat,
    Commande,
    ReductionQuantite,
    StatutBonAchat,
    TypeReduction,
    calculer_reduction_quantite,
)
from apps.boutique.tests.factories import (
    BonAchatFactory,
    CommandeFactory,
    LigneCommandeFactory,
    ProduitBonAchatFactory,
    ProduitFactory,
    RegleReductionFactory,
    VarianteProduitFactory,
)

pytestmark = pytest.mark.django_db


def test_stock_total_additionne_toutes_les_variantes():
    produit = ProduitFactory()
    VarianteProduitFactory(produit=produit, taille="S", stock=3)
    VarianteProduitFactory(produit=produit, taille="M", stock=7)
    assert produit.stock_total == 10


def test_stock_faible_sous_le_seuil_et_non_nul():
    produit = ProduitFactory(seuil_alerte_stock=5)
    VarianteProduitFactory(produit=produit, stock=3)
    assert produit.stock_faible is True
    assert produit.en_rupture is False


def test_en_rupture_quand_stock_total_nul():
    produit = ProduitFactory(seuil_alerte_stock=5)
    VarianteProduitFactory(produit=produit, stock=0)
    assert produit.en_rupture is True
    assert produit.stock_faible is False


# --- Produit bon d'achat (demande utilisateur du 2026-09-23, achat intégré au catalogue) ---


def test_produit_bon_achat_cree_automatiquement_une_variante_sentinelle():
    produit = ProduitBonAchatFactory()
    assert produit.variantes.count() == 1
    variante = produit.variantes.get()
    assert variante.taille == ""
    assert variante.couleur == ""


def test_produit_bon_achat_nest_jamais_en_rupture_ni_stock_faible():
    produit = ProduitBonAchatFactory(seuil_alerte_stock=5)
    variante = produit.variantes.get()
    variante.stock = 0
    variante.save(update_fields=["stock"])
    produit.refresh_from_db()
    assert produit.en_rupture is False
    assert produit.stock_faible is False


def test_produit_bon_achat_save_ne_duplique_pas_la_variante_sentinelle():
    produit = ProduitBonAchatFactory()
    produit.nom = "Bon d'achat CID — renommé"
    produit.save()
    assert produit.variantes.count() == 1


def test_numero_commande_genere_automatiquement_et_unique():
    commande1 = CommandeFactory()
    commande2 = CommandeFactory()
    assert commande1.numero_commande.startswith("CMD-")
    assert commande1.numero_commande != commande2.numero_commande
    assert Commande.objects.filter(numero_commande=commande1.numero_commande).count() == 1


def test_ligne_commande_sous_total():
    ligne = LigneCommandeFactory(quantite=3, prix_unitaire=Decimal("12.50"))
    assert ligne.sous_total == Decimal("37.50")


def test_prix_final_egal_au_prix_sans_reduction():
    produit = ProduitFactory(prix=Decimal("25.00"), pourcentage_reduction=None)
    assert produit.prix_final == Decimal("25.00")


def test_prix_final_applique_le_pourcentage_de_reduction():
    produit = ProduitFactory(prix=Decimal("50.00"), pourcentage_reduction=20)
    assert produit.prix_final == Decimal("40.00")


def test_prix_final_arrondi_a_deux_decimales():
    produit = ProduitFactory(prix=Decimal("9.99"), pourcentage_reduction=33)
    # 9.99 * 0.67 = 6.6933 -> arrondi à 6.69
    assert produit.prix_final == Decimal("6.69")


# --- RegleReduction / calculer_reduction_quantite (demande utilisateur du 2026-09-23) ---


def test_calculer_reduction_quantite_sans_regle_active():
    produit = ProduitFactory()
    assert calculer_reduction_quantite(produit, 100) == ReductionQuantite(0, None)


def test_calculer_reduction_quantite_article_offert_sous_le_seuil():
    produit = ProduitFactory()
    RegleReductionFactory(produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT)
    assert calculer_reduction_quantite(produit, 4).quantite_offerte == 0


def test_calculer_reduction_quantite_article_offert_division_entiere():
    produit = ProduitFactory()
    RegleReductionFactory(produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT)
    # 12 // 5 = 2 articles offerts
    assert calculer_reduction_quantite(produit, 12).quantite_offerte == 2


def test_calculer_reduction_quantite_pourcentage_atteint():
    produit = ProduitFactory()
    RegleReductionFactory(
        produit=produit,
        seuil_quantite=10,
        type_reduction=TypeReduction.POURCENTAGE,
        pourcentage=10,
    )
    resultat = calculer_reduction_quantite(produit, 10)
    assert resultat.pourcentage_applique == 10
    assert resultat.quantite_offerte == 0


def test_calculer_reduction_quantite_retient_le_seuil_le_plus_eleve_atteint():
    produit = ProduitFactory()
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.POURCENTAGE, pourcentage=5
    )
    RegleReductionFactory(
        produit=produit, seuil_quantite=10, type_reduction=TypeReduction.POURCENTAGE, pourcentage=15
    )
    assert calculer_reduction_quantite(produit, 10).pourcentage_applique == 15
    assert calculer_reduction_quantite(produit, 7).pourcentage_applique == 5


def test_calculer_reduction_quantite_cumule_les_deux_types_independamment():
    produit = ProduitFactory()
    RegleReductionFactory(produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT)
    RegleReductionFactory(
        produit=produit, seuil_quantite=10, type_reduction=TypeReduction.POURCENTAGE, pourcentage=10
    )
    resultat = calculer_reduction_quantite(produit, 10)
    assert resultat.quantite_offerte == 2
    assert resultat.pourcentage_applique == 10


def test_calculer_reduction_quantite_ignore_les_regles_inactives():
    produit = ProduitFactory()
    RegleReductionFactory(
        produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT, actif=False
    )
    assert calculer_reduction_quantite(produit, 10).quantite_offerte == 0


def test_un_seul_palier_par_seuil_et_produit():
    produit = ProduitFactory()
    RegleReductionFactory(produit=produit, seuil_quantite=5, type_reduction=TypeReduction.ARTICLE_OFFERT)
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            RegleReductionFactory(
                produit=produit,
                seuil_quantite=5,
                type_reduction=TypeReduction.POURCENTAGE,
                pourcentage=10,
            )


# --- LigneCommande.sous_total_net ---


def test_ligne_commande_sous_total_net_deduit_la_reduction_quantite():
    ligne = LigneCommandeFactory(
        quantite=5, prix_unitaire=Decimal("10.00"), reduction_quantite=Decimal("10.00")
    )
    assert ligne.sous_total == Decimal("50.00")
    assert ligne.sous_total_net == Decimal("40.00")


# --- BonAchat (demande utilisateur du 2026-09-23) ---


def test_bon_achat_code_genere_automatiquement_et_unique():
    bon1 = BonAchatFactory()
    bon2 = BonAchatFactory()
    assert bon1.code.startswith("BON-")
    assert bon1.code != bon2.code


def test_bon_achat_non_actif_nest_pas_utilisable():
    # Plus d'état EN_ATTENTE depuis le 2026-09-23 (un bon est toujours créé déjà ACTIF, voir
    # StatutBonAchat) — seul EPUISE reste un statut "non actif" à tester ici ; `utilisable` se
    # fie au statut seul, indépendamment du solde (voir test dédié ci-dessous).
    bon = BonAchatFactory(statut=StatutBonAchat.EPUISE, solde=Decimal("10.00"))
    assert bon.utilisable is False


def test_bon_achat_sans_solde_nest_pas_utilisable():
    bon = BonAchatFactory(statut=StatutBonAchat.ACTIF, solde=Decimal("0.00"))
    assert bon.utilisable is False


def test_bon_achat_expire_nest_pas_utilisable():
    bon = BonAchatFactory(
        statut=StatutBonAchat.ACTIF,
        date_expiration=timezone.now() - timedelta(days=1),
    )
    assert bon.est_expire is True
    assert bon.utilisable is False


def test_bon_achat_actif_avec_solde_et_non_expire_est_utilisable():
    bon = BonAchatFactory(
        statut=StatutBonAchat.ACTIF,
        date_expiration=timezone.now() + timedelta(days=30),
    )
    assert bon.utilisable is True


def test_bon_achat_activer_fixe_le_statut_et_lexpiration():
    # Instance non sauvegardée, hors factory (dont le statut par défaut est déjà ACTIF depuis le
    # 2026-09-23) — pour tester le mécanisme de `.activer()` lui-même, tel qu'appelé par
    # views._generer_bons_achat sur un BonAchat tout juste construit.
    bon = BonAchat(montant_initial=Decimal("50.00"), solde=Decimal("50.00"))
    bon.activer()
    assert bon.statut == StatutBonAchat.ACTIF
    assert bon.date_paiement_confirme is not None
    assert bon.date_expiration is not None
    assert bon.date_expiration > timezone.now() + timedelta(days=365 * 2)

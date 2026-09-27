"""Tests API — app boutique (FDD §2.2/§3.4, SCD §2.3 A01 : IDOR)."""

import io
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.boutique.models import Commande, StatutCommande, StatutProduit
from apps.boutique.tests.factories import (
    CommandeFactory,
    LigneCommandeFactory,
    ProduitFactory,
    VarianteProduitFactory,
)
from apps.membres.models import StatutMembre
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email, **membre_kwargs):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user, **membre_kwargs)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


PRODUIT_LIST_URL = "boutique:produit-list"
COMMANDE_LIST_URL = "boutique:commande-list"
PASSER_URL = "boutique:commande-passer"
VARIANTE_LIST_URL = "boutique:variante-list"


def _produit_detail_url(produit):
    return reverse("boutique:produit-detail", args=[produit.id])


def _commande_detail_url(commande):
    return reverse("boutique:commande-detail", args=[commande.id])


def _annuler_url(commande):
    return reverse("boutique:commande-annuler", args=[commande.id])


def _changer_statut_url(commande):
    return reverse("boutique:commande-changer-statut", args=[commande.id])


def _adresse_livraison():
    return {
        "nom_destinataire": "Membre Test",
        "adresse_livraison": "Musterstraße 1",
        "code_postal_livraison": "10115",
        "ville_livraison": "Berlin",
        "pays_livraison": "Allemagne",
    }


# --- Catalogue : visibilité et permissions d'écriture ---


def test_list_produits_non_authentifie_ne_voit_que_les_produits_publies(api_client):
    """Depuis le 2026-09-26 (onglet Shop de la page d'accueil publique, demande utilisateur),
    un visiteur anonyme peut lister le catalogue — get_queryset masque cependant les
    brouillons exactement comme pour un membre normal. Remplace l'ancien test qui attendait
    un refus 401 pur."""
    ProduitFactory(statut=StatutProduit.BROUILLON, nom="Brouillon secret")
    ProduitFactory(statut=StatutProduit.PUBLIE, nom="Publié visible")
    resp = api_client.get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    noms = [p["nom"] for p in resp.data["results"]]
    assert "Publié visible" in noms
    assert "Brouillon secret" not in noms


def test_creer_produit_non_authentifie_refuse(api_client):
    resp = api_client.post(reverse(PRODUIT_LIST_URL), {"nom": "x"}, format="json")
    assert resp.status_code == 401


def test_membre_normal_ne_voit_pas_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m1@example.de")
    ProduitFactory(statut=StatutProduit.BROUILLON, nom="Brouillon secret")
    ProduitFactory(statut=StatutProduit.PUBLIE, nom="Publié visible")
    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    noms = [p["nom"] for p in resp.data["results"]]
    assert "Publié visible" in noms
    assert "Brouillon secret" not in noms


def test_bureau_admin_voit_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau@example.de")
    ProduitFactory(statut=StatutProduit.BROUILLON, nom="Brouillon")
    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    noms = [p["nom"] for p in resp.data["results"]]
    assert "Brouillon" in noms


# --- Prix membre/non-membre (demande utilisateur, mycid.org/shop — badge "Mitglieder Preis") ---


def test_prix_affiche_est_le_prix_membre_pour_un_membre_actif_connecte(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m-prix-membre@example.de")
    ProduitFactory(nom="Mug CID", prix=Decimal("15.00"), prix_membre=Decimal("12.00"))

    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    produit_data = next(p for p in resp.data["results"] if p["nom"] == "Mug CID")
    assert produit_data["est_prix_membre"] is True
    assert Decimal(produit_data["prix_affiche"]) == Decimal("12.00")


def test_prix_affiche_reste_le_prix_standard_pour_un_membre_en_attente(api_client):
    user, membre = _user_avec_membre(
        Role.MEMBRE, "m-prix-attente@example.de", statut=StatutMembre.EN_ATTENTE
    )
    ProduitFactory(nom="Mug CID", prix=Decimal("15.00"), prix_membre=Decimal("12.00"))

    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    produit_data = next(p for p in resp.data["results"] if p["nom"] == "Mug CID")
    assert produit_data["est_prix_membre"] is False
    assert Decimal(produit_data["prix_affiche"]) == Decimal("15.00")


def test_prix_affiche_reste_le_prix_standard_sans_prix_membre_defini(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m-prix-sans@example.de")
    ProduitFactory(nom="Écharpe", prix=Decimal("20.00"), prix_membre=None)

    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200
    produit_data = next(p for p in resp.data["results"] if p["nom"] == "Écharpe")
    assert produit_data["est_prix_membre"] is False
    assert Decimal(produit_data["prix_affiche"]) == Decimal("20.00")


def test_membre_normal_ne_peut_pas_creer_produit(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m2@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 403


def test_bureau_admin_peut_creer_produit(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau2@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 201
    assert resp.data["statut"] == StatutProduit.BROUILLON


def test_bureau_admin_peut_definir_le_prix_membre(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-prix-membre@example.de")
    produit = ProduitFactory(prix=Decimal("30.00"))
    resp = _auth(api_client, user).patch(_produit_detail_url(produit), {"prix_membre": "24.00"})
    assert resp.status_code == 200, resp.data
    assert Decimal(resp.data["prix_membre"]) == Decimal("24.00")
    produit.refresh_from_db()
    assert produit.prix_membre == Decimal("24.00")


def test_rh_ne_peut_pas_modifier_produit(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    produit = ProduitFactory()
    resp = _auth(api_client, user).patch(_produit_detail_url(produit), {"prix": "99.00"})
    assert resp.status_code == 403


def test_creer_produit_avec_stock_initial_cree_une_variante_unique(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau10@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Écharpe", "categorie": "accessoires", "prix": "15.00", "stock_initial": 8},
    )
    assert resp.status_code == 201
    assert resp.data["stock_total"] == 8
    assert len(resp.data["variantes"]) == 1
    assert resp.data["variantes"][0]["taille"] == ""
    assert resp.data["variantes"][0]["couleur"] == ""


def test_creer_produit_sans_stock_initial_ne_cree_pas_de_variante(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau11@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Casquette", "categorie": "accessoires", "prix": "12.00"},
    )
    assert resp.status_code == 201
    assert resp.data["stock_total"] == 0
    assert len(resp.data["variantes"]) == 0


def test_creer_produit_bon_achat_avec_stock_initial_ne_leve_pas_dintegrite(api_client):
    # Régression (bug réel constaté en production le 2026-09-23) : GestionCatalogueTab envoie
    # toujours `stock_initial` (0 par défaut) même pour un "bon_achat", champ pourtant masqué
    # côté UI — sans la garde ajoutée dans ProduitSerializer.create, la VarianteProduit
    # "sentinelle" auto-créée par Produit.save() (voir TypeProduit.BON_ACHAT) et celle demandée
    # par `stock_initial` entrent toutes deux en collision sur (produit, taille="", couleur=""),
    # violant la contrainte d'unicité "une_seule_variante_par_combinaison" (IntegrityError → 500
    # brut, sans JSON, DEBUG=False en prod).
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau13@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {
            "nom": "Bon d'achat CID",
            "categorie": "bon_achat",
            "type_produit": "bon_achat",
            "prix": "0.00",
            "stock_initial": 0,
        },
    )
    assert resp.status_code == 201, resp.data
    # Une seule variante (la sentinelle) — jamais deux.
    assert len(resp.data["variantes"]) == 1
    assert resp.data["variantes"][0]["taille"] == ""
    assert resp.data["variantes"][0]["couleur"] == ""


def test_modifier_produit_ignore_stock_initial(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau12@example.de")
    produit = ProduitFactory()
    VarianteProduitFactory(produit=produit, stock=5)
    resp = _auth(api_client, user).patch(_produit_detail_url(produit), {"stock_initial": 999})
    assert resp.status_code == 200
    produit.refresh_from_db()
    assert produit.stock_total == 5  # inchangé, aucune variante fantôme créée


def test_prix_final_expose_par_lapi_avec_reduction(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m25@example.de")
    produit = ProduitFactory(prix=Decimal("40.00"), pourcentage_reduction=25)
    resp = _auth(api_client, user).get(_produit_detail_url(produit))
    assert resp.status_code == 200
    assert Decimal(resp.data["prix_final"]) == Decimal("30.00")


def test_pourcentage_reduction_hors_bornes_refuse(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau13@example.de")
    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {
            "nom": "Sweat",
            "categorie": "vetements",
            "prix": "45.00",
            "pourcentage_reduction": 95,
        },
    )
    assert resp.status_code == 400
    assert "pourcentage_reduction" in resp.data["details"]


# --- variantes : filtre id__in (revalidation du stock panier côté frontend) ---


def test_list_variantes_ne_leve_pas_malgre_labsence_de_created_at(api_client):
    # Régression : VarianteProduit n'a pas de champ `created_at`, contrairement à
    # Produit/Commande — utiliser BoutiqueCursorPagination (tri sur `-created_at`) pour ce
    # viewset faisait échouer TOUT listing de /boutique/variantes/ en 500.
    user, _ = _user_avec_membre(Role.MEMBRE, "m28@example.de")
    VarianteProduitFactory(stock=1)
    resp = _auth(api_client, user).get(reverse(VARIANTE_LIST_URL))
    assert resp.status_code == 200


def test_variantes_filtre_id_in_ne_retourne_que_les_ids_demandes(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m27@example.de")
    v1 = VarianteProduitFactory(stock=3)
    v2 = VarianteProduitFactory(stock=0)
    VarianteProduitFactory(stock=9)  # non demandée, ne doit pas apparaître

    resp = _auth(api_client, user).get(reverse(VARIANTE_LIST_URL), {"id__in": f"{v1.id},{v2.id}"})
    assert resp.status_code == 200
    ids_retournes = {r["id"] for r in resp.data["results"]}
    assert ids_retournes == {str(v1.id), str(v2.id)}
    stocks = {r["id"]: r["stock"] for r in resp.data["results"]}
    assert stocks[str(v2.id)] == 0


# --- passer commande : stock atomique, prix serveur, panier ---


def test_passer_commande_decremente_le_stock_et_calcule_le_montant(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m3@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("20.00")
    variante.produit.save(update_fields=["prix"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 3}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(resp.data["montant_total"]) == Decimal("60.00")

    variante.refresh_from_db()
    assert variante.stock == 2


def test_passer_commande_ignore_le_prix_envoye_par_le_client(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m4@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("20.00")
    variante.produit.save(update_fields=["prix"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1, "prix_unitaire": "0.01"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(resp.data["montant_total"]) == Decimal("20.00")
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("20.00")


def test_passer_commande_applique_le_prix_solde(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m26@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("40.00")
    variante.produit.pourcentage_reduction = 25
    variante.produit.save(update_fields=["prix", "pourcentage_reduction"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 2}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("30.00")
    assert Decimal(resp.data["montant_total"]) == Decimal("60.00")


def test_passer_commande_facture_le_prix_membre_a_un_membre_actif(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m-passer-membre@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("15.00")
    variante.produit.prix_membre = Decimal("12.00")
    variante.produit.save(update_fields=["prix", "prix_membre"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 2}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("12.00")
    assert Decimal(resp.data["montant_total"]) == Decimal("24.00")


def test_passer_commande_ignore_toute_pretention_de_prix_membre_dun_non_membre_actif(api_client):
    """Sécurité (CLAUDE.md §8, même principe que test_passer_commande_ignore_le_prix_envoye_par_
    le_client) : un membre en_attente ne doit JAMAIS pouvoir obtenir le prix membre, quoi qu'il
    envoie dans la requête — le serveur seul décide, à partir de request.user.membre.statut."""
    user, membre = _user_avec_membre(
        Role.MEMBRE, "m-passer-en-attente@example.de", statut=StatutMembre.EN_ATTENTE
    )
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("15.00")
    variante.produit.prix_membre = Decimal("12.00")
    variante.produit.save(update_fields=["prix", "prix_membre"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            # Tentative de manipulation : un champ arbitraire ne changeant rien côté serializer,
            # mais on vérifie explicitement qu'aucun mécanisme ne laisse passer le prix membre.
            "lignes": [{"variante": str(variante.id), "quantite": 1, "prix_unitaire": "12.00"}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("15.00")


def test_passer_commande_refuse_si_stock_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m5@example.de")
    variante = VarianteProduitFactory(stock=1)

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 2}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 400
    assert "lignes" in resp.data["details"]
    variante.refresh_from_db()
    assert variante.stock == 1


def test_passer_commande_cree_une_notification_in_app(api_client):
    from apps.notifications.models import Notification, TypeNotification

    user, membre = _user_avec_membre(Role.MEMBRE, "m22@example.de")
    variante = VarianteProduitFactory(stock=5)

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201

    notification = Notification.objects.get(destinataire=user)
    assert notification.type_notification == TypeNotification.BOUTIQUE_COMMANDE_CONFIRMEE
    assert notification.lien == f"/boutique?onglet=commandes&commande={resp.data['id']}"


def test_passer_commande_notifie_le_staff_bureau_admin(api_client):
    """Ajouté le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — voir
    notifications.notifier_nouvelle_commande_staff : tout Bureau Admin+ est notifié d'une
    nouvelle commande, en plus de la confirmation envoyée au client."""
    user, _membre = _user_avec_membre(Role.MEMBRE, "m23@example.de")
    bureau = User.objects.create_user(
        email="bureau@example.de", password="Password123!", role=Role.BUREAU_ADMIN, is_active=True
    )
    rh = User.objects.create_user(
        email="rh-boutique@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    variante = VarianteProduitFactory(stock=5)

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 201

    notification = Notification.objects.get(destinataire=bureau)
    assert notification.type_notification == TypeNotification.BOUTIQUE_NOUVELLE_COMMANDE
    assert notification.lien == "/admin/boutique"
    # RH n'a pas le niveau requis (Bureau Admin+) pour cette file de gestion.
    assert not Notification.objects.filter(
        destinataire=rh, type_notification=TypeNotification.BOUTIQUE_NOUVELLE_COMMANDE
    ).exists()


def test_passer_commande_panier_vide_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m6@example.de")
    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {"lignes": [], **_adresse_livraison()},
        format="json",
    )
    assert resp.status_code == 400


def test_passer_commande_produit_non_publie_refuse(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m7@example.de")
    variante = VarianteProduitFactory(stock=5)
    variante.produit.statut = StatutProduit.ARCHIVE
    variante.produit.save(update_fields=["statut"])

    resp = _auth(api_client, user).post(
        reverse(PASSER_URL),
        {
            "lignes": [{"variante": str(variante.id), "quantite": 1}],
            **_adresse_livraison(),
        },
        format="json",
    )
    assert resp.status_code == 400


# --- IDOR : visibilité et actions sur les commandes ---


def test_membre_ne_voit_que_ses_propres_commandes(api_client):
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m8@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m9@example.de")
    CommandeFactory(membre=membre1)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, user1).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre1.id)


def test_role_personnalise_eleve_voit_toutes_les_commandes(api_client):
    """apps.rbac Phase B : un rôle personnalisé avec au moins la lecture sur "boutique" voit
    TOUTES les commandes, comme Bureau Admin+ — voir is_elevated_for_module."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, membre = _user_avec_membre(Role.MEMBRE, "vertrieb-idor@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m-idor-autre@example.de")
    role = RoleDefinitionFactory(slug="vertrieb-boutique-idor")
    RoleModulePermissionFactory(role=role, module="boutique", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role)
    CommandeFactory(membre=membre)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, user).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_membre_sans_role_eleve_ne_voit_toujours_que_ses_propres_commandes(api_client):
    """Régression explicite après le câblage Phase B : sans UserRoleAssignment
    supplémentaire, le comportement historique (SCD §2.3 A01) n'a pas bougé."""
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m-idor-regression1@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m-idor-regression2@example.de")
    CommandeFactory(membre=membre1)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, user1).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre1.id)


def test_rh_ne_voit_pas_toutes_les_commandes(api_client):
    rh_user, rh_membre = _user_avec_membre(Role.RH, "rh2@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m10@example.de")
    CommandeFactory(membre=rh_membre)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, rh_user).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_bureau_admin_voit_toutes_les_commandes(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau3@example.de")
    _, membre1 = _user_avec_membre(Role.MEMBRE, "m11@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m12@example.de")
    CommandeFactory(membre=membre1)
    CommandeFactory(membre=membre2)

    resp = _auth(api_client, admin).get(reverse(COMMANDE_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_annuler_commande_dun_autre_membre_refuse(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "m13@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m14@example.de")
    commande = CommandeFactory(membre=membre2, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user1).post(_annuler_url(commande))
    assert resp.status_code in (403, 404)


def test_annuler_sa_propre_commande_restitue_le_stock(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m15@example.de")
    variante = VarianteProduitFactory(stock=5)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    LigneCommandeFactory(commande=commande, variante=variante, quantite=2)
    variante.stock = 3
    variante.save(update_fields=["stock"])

    resp = _auth(api_client, user).post(_annuler_url(commande))
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.ANNULEE

    variante.refresh_from_db()
    assert variante.stock == 5


def test_annuler_commande_deja_expediee_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m16@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)

    resp = _auth(api_client, user).post(_annuler_url(commande))
    assert resp.status_code == 400


def test_annuler_sa_propre_commande_nest_pas_notifie(api_client):
    """Ajouté le 2026-09-16 — pas besoin d'informer un client de sa propre action, voir
    notifications.notifier_commande_annulee et views.CommandeViewSet.annuler."""
    user, membre = _user_avec_membre(Role.MEMBRE, "m15b@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user).post(_annuler_url(commande))
    assert resp.status_code == 200
    assert Notification.objects.filter(destinataire=user).count() == 0


def test_bureau_admin_annule_la_commande_dun_membre_le_notifie(api_client):
    """Ajouté le 2026-09-16 — voir notifications.notifier_commande_annulee : le client est
    notifié quand c'est un tiers (Bureau Admin+) qui annule sa commande."""
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-annule@example.de")
    user_membre, membre = _user_avec_membre(Role.MEMBRE, "m15c@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin).post(_annuler_url(commande))
    assert resp.status_code == 200
    notification = Notification.objects.get(destinataire=user_membre)
    assert notification.type_notification == TypeNotification.BOUTIQUE_COMMANDE_ANNULEE
    assert notification.lien == f"/boutique?onglet=commandes&commande={commande.id}"


# --- changer_statut : réservé Bureau Admin+, transitions valides ---


def test_membre_ne_peut_pas_changer_le_statut(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m17@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 403


def test_bureau_admin_peut_faire_progresser_le_statut(api_client):
    # EN_ATTENTE -> CONFIRMEE passe désormais exclusivement par `confirmer_paiement`
    # (Directeur Financier+, voir tests dédiés plus bas) : `changer_statut` couvre encore
    # CONFIRMEE -> EN_PREPARATION, une transition de gestion générale sans enjeu financier.
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau4@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m18@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.EN_PREPARATION}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.EN_PREPARATION


def test_changer_statut_vers_confirmee_desormais_refuse(api_client):
    # Loophole fermé (demande utilisateur du 2026-09-15) : confirmer le paiement ne doit
    # être possible que via l'action dédiée `confirmer_paiement` (Directeur Financier+), pas
    # via le `changer_statut` générique (Bureau Admin+) qui contournerait la vérification du
    # rôle et du mode de paiement.
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau30@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m30@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 400


def test_changer_statut_vers_expediee_desormais_refuse(api_client):
    # Même principe : l'expédition passe désormais par `expedier` (Directeur Financier+).
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau31@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m31@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_PREPARATION)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.EXPEDIEE}
    )
    assert resp.status_code == 400


def test_changer_statut_transition_invalide_refusee(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau5@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m19@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.LIVREE}
    )
    assert resp.status_code == 400


def test_changer_statut_vers_annulee_restitue_le_stock(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau6@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m20@example.de")
    variante = VarianteProduitFactory(stock=5)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)
    LigneCommandeFactory(commande=commande, variante=variante, quantite=2)
    variante.stock = 3
    variante.save(update_fields=["stock"])

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.ANNULEE}
    )
    assert resp.status_code == 200

    variante.refresh_from_db()
    assert variante.stock == 5


def test_changer_statut_vers_annulee_notifie_le_client(api_client):
    """Ajouté le 2026-09-16 — changer_statut est réservé Bureau Admin+ (jamais le client
    lui-même), donc toujours notifié — voir notifications.notifier_commande_annulee."""
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau6b@example.de")
    user_membre, membre = _user_avec_membre(Role.MEMBRE, "m20b@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.ANNULEE}
    )
    assert resp.status_code == 200
    notification = Notification.objects.get(destinataire=user_membre)
    assert notification.type_notification == TypeNotification.BOUTIQUE_COMMANDE_ANNULEE


# Note : la notification d'expédition est désormais testée via l'action `expedier`
# (voir la section "confirmer-paiement / expedier / retours" plus bas), `changer_statut`
# ne pouvant plus produire cette transition.


# Note : cette transition (EN_ATTENTE -> CONFIRMEE) est désormais refusée par
# `changer_statut` — voir test_changer_statut_vers_confirmee_desormais_refuse plus haut.
# L'absence de notification lors de `confirmer_paiement` est vérifiée dans la section dédiée
# ci-dessous.


def test_changer_statut_sur_commande_terminale_refuse(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau7@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m21@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.REMBOURSEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.CONFIRMEE}
    )
    assert resp.status_code == 400


# --- confirmer_paiement / expedier / retours (demande utilisateur du 2026-09-15) ---
# Workflow : commande -> paiement (en ligne/virement/espèces) -> confirmer_paiement
# (Directeur Financier+) -> expedier (Directeur Financier+, avec numéro de suivi) ; voir
# apps/boutique/permissions.py et views.py pour le détail des seuils.


def _confirmer_paiement_url(commande):
    return reverse("boutique:commande-confirmer-paiement", args=[commande.id])


def _expedier_url(commande):
    return reverse("boutique:commande-expedier", args=[commande.id])


RETOUR_LIST_URL = "boutique:retour-list"


def _retour_detail_url(retour):
    return reverse("boutique:retour-detail", args=[retour.id])


# confirmer_paiement


def test_confirmer_paiement_directeur_financier_ok(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df1@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m32@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, df).post(
        _confirmer_paiement_url(commande), {"mode_paiement": "virement"}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.CONFIRMEE
    assert resp.data["mode_paiement"] == "virement"
    assert resp.data["date_paiement_confirme"] is not None
    assert resp.data["paiement_confirme_par"] is not None


def test_confirmer_paiement_admin_app_ok(api_client):
    admin_app, _ = _user_avec_membre(Role.SUPER_ADMIN, "admin1@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m33@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, admin_app).post(
        _confirmer_paiement_url(commande), {"mode_paiement": "especes"}
    )
    assert resp.status_code == 200


def test_confirmer_paiement_bureau_admin_refuse(api_client):
    # Bureau Admin gère les commandes en général mais pas la confirmation de paiement —
    # seuil plus strict, Directeur Financier+ (voir permissions.py).
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau14@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m34@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, bureau).post(
        _confirmer_paiement_url(commande), {"mode_paiement": "virement"}
    )
    assert resp.status_code == 403


def test_confirmer_paiement_membre_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m35@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user).post(
        _confirmer_paiement_url(commande), {"mode_paiement": "virement"}
    )
    assert resp.status_code == 403


def test_confirmer_paiement_statut_invalide_refuse(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df2@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m36@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, df).post(
        _confirmer_paiement_url(commande), {"mode_paiement": "virement"}
    )
    assert resp.status_code == 400


def test_confirmer_paiement_sans_mode_paiement_refuse(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df3@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m37@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, df).post(_confirmer_paiement_url(commande), {})
    assert resp.status_code == 400


# expedier — flux normal


def test_expedier_directeur_financier_cree_une_notification_avec_suivi(api_client):
    from apps.notifications.models import Notification, TypeNotification

    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df4@example.de")
    user, membre = _user_avec_membre(Role.MEMBRE, "m38@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, df).post(
        _expedier_url(commande), {"numero_suivi": "DHL123456789", "transporteur": "DHL"}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.EXPEDIEE
    assert resp.data["numero_suivi"] == "DHL123456789"

    notification = Notification.objects.get(destinataire=user)
    assert notification.type_notification == TypeNotification.BOUTIQUE_COMMANDE_EXPEDIEE
    assert "DHL123456789" in notification.message
    assert notification.lien == f"/boutique?onglet=commandes&commande={commande.id}"


def test_expedier_depuis_en_preparation_ok(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df5@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m39@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_PREPARATION)

    resp = _auth(api_client, df).post(_expedier_url(commande), {"numero_suivi": "UPS999"})
    assert resp.status_code == 200


def test_expedier_depuis_en_attente_sans_nacherfassement_refuse(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df6@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m40@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, df).post(_expedier_url(commande), {"numero_suivi": "UPS000"})
    assert resp.status_code == 400


def test_expedier_bureau_admin_refuse(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau15@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m41@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, bureau).post(_expedier_url(commande), {"numero_suivi": "X1"})
    assert resp.status_code == 403


def test_expedier_sans_numero_suivi_refuse(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df7@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m42@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, df).post(_expedier_url(commande), {})
    assert resp.status_code == 400


def test_expedier_date_future_refusee(api_client):
    from datetime import timedelta

    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df8@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m43@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    demain = (timezone.now() + timedelta(days=1)).isoformat()
    resp = _auth(api_client, df).post(
        _expedier_url(commande), {"numero_suivi": "X2", "date_expedition": demain}
    )
    assert resp.status_code == 400


# expedier — nacherfassement (saisie rétroactive, demande utilisateur du 2026-09-15)


def test_expedier_nacherfassement_depuis_en_attente_ok(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df9@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m44@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, df).post(
        _expedier_url(commande),
        {
            "numero_suivi": "LEGACY001",
            "nacherfassement": True,
            "mode_paiement": "especes",
        },
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.EXPEDIEE
    assert resp.data["mode_paiement"] == "especes"
    assert resp.data["date_paiement_confirme"] is not None
    assert resp.data["paiement_confirme_par"] is not None


def test_expedier_nacherfassement_sans_mode_paiement_refuse(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df10@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m45@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, df).post(
        _expedier_url(commande), {"numero_suivi": "LEGACY002", "nacherfassement": True}
    )
    assert resp.status_code == 400


def test_expedier_nacherfassement_ne_recrase_pas_un_paiement_deja_confirme(api_client):
    df, _ = _user_avec_membre(Role.DIR_FINANCIER, "df11@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m46@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)
    # Paiement déjà confirmé (via confirmer_paiement, simulé directement ici) en virement.
    commande.mode_paiement = "virement"
    commande.date_paiement_confirme = timezone.now()
    commande.save(update_fields=["mode_paiement", "date_paiement_confirme"])

    resp = _auth(api_client, df).post(
        _expedier_url(commande),
        {
            "numero_suivi": "X3",
            "nacherfassement": True,
            "mode_paiement": "especes",
        },
    )
    assert resp.status_code == 200
    assert resp.data["mode_paiement"] == "virement"  # inchangé, pas écrasé par "especes"


# retours — retours partiels par ligne (Bureau Admin+)


def test_creer_retour_bureau_admin_ok(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau16@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m47@example.de")
    variante = VarianteProduitFactory(stock=1)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=3)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 2,
            "motif": "mauvaise_taille",
            "commentaire": "Taille trop petite",
        },
        format="json",
    )
    assert resp.status_code == 201

    variante.refresh_from_db()
    assert variante.stock == 3  # 1 initial + 2 retournés

    ligne.refresh_from_db()
    assert ligne.quantite_retournee == 2
    assert ligne.quantite_retournable == 1


def test_creer_retour_membre_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "m48@example.de")
    variante = VarianteProduitFactory(stock=1)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, user).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 403


def test_creer_retour_quantite_superieure_refusee(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau17@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m49@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 3,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 400
    variante.refresh_from_db()
    assert variante.stock == 0  # pas de réintégration sur un retour refusé


def test_creer_retour_commande_annulee_refuse(api_client):
    # ANNULEE/REMBOURSEE ont déjà eu leur stock intégralement restitué (_restituer_stock) —
    # un Retour supplémentaire par-dessus créerait un double comptage de stock.
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau18@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m50@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.ANNULEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_creer_retour_commande_remboursee_refuse(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau25@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m56@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.REMBOURSEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 400


def test_creer_retour_commande_en_attente_ok(api_client):
    # "Nacherfassung von Retouren" (précisé le 2026-09-16) : un retour doit pouvoir être
    # enregistré même pour une commande jamais fait passer par confirmer_paiement/expedier
    # dans le système — symétrique à expedier(nacherfassement=True).
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau26@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m57@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=10)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 5,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 201

    variante.refresh_from_db()
    assert variante.stock == 5
    ligne.refresh_from_db()
    assert ligne.quantite_retournable == 5


def test_creer_retour_commande_confirmee_ok(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau27@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m58@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=4)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 201


def test_creer_retour_commande_en_preparation_ok(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau28@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m59@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_PREPARATION)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=4)

    resp = _auth(api_client, bureau).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 201


def test_creer_retour_partiel_puis_retour_complementaire(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau19@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m51@example.de")
    variante = VarianteProduitFactory(stock=0)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.LIVREE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=5)

    api = _auth(api_client, bureau)
    resp1 = api.post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 2,
            "motif": "defectueux",
        },
        format="json",
    )
    assert resp1.status_code == 201

    resp2 = api.post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 3,
            "motif": "erreur_envoi",
        },
        format="json",
    )
    assert resp2.status_code == 201

    ligne.refresh_from_db()
    assert ligne.quantite_retournee == 5
    assert ligne.quantite_retournable == 0

    # Une troisième tentative dépasse désormais le quota retournable.
    resp3 = api.post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp3.status_code == 400

    variante.refresh_from_db()
    assert variante.stock == 5


def test_list_retours_filtre_par_commande(api_client):
    bureau, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau20@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "m52@example.de")
    commande1 = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    commande2 = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    variante1 = VarianteProduitFactory(stock=0)
    variante2 = VarianteProduitFactory(stock=0)
    ligne1 = LigneCommandeFactory(commande=commande1, variante=variante1, quantite=2)
    ligne2 = LigneCommandeFactory(commande=commande2, variante=variante2, quantite=2)

    api = _auth(api_client, bureau)
    api.post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande1.id),
            "ligne_commande": str(ligne1.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    api.post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande2.id),
            "ligne_commande": str(ligne2.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )

    resp = api.get(reverse(RETOUR_LIST_URL), {"commande": str(commande1.id)})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["commande"] == commande1.id


# --- Vente au comptoir/vereinfachter Kassenverkauf par le Directeur Financier/Admin (ajoutée le
# 2026-09-21, retour utilisateur : "Shop-Artikel soll für Artikel aus Boutique sein", dans le
# formulaire "Barzahlung eintragen" de CotisationsEnAttentePage) — voir
# CommandeViewSet.vendre_especes.

VENDRE_ESPECES_URL = "boutique:commande-vendre-especes"


def test_df_vend_un_article_en_especes_et_decremente_le_stock(api_client):
    user, df = _user_avec_membre(Role.DIR_FINANCIER, "df1@example.de")
    membre_cible = MembreFactory()
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("20.00")
    variante.produit.save(update_fields=["prix"])

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 2},
        format="json",
    )

    assert resp.status_code == 201, resp.data
    assert resp.data["statut"] == StatutCommande.CONFIRMEE
    assert resp.data["mode_paiement"] == "especes"
    assert Decimal(resp.data["montant_total"]) == Decimal("40.00")

    variante.refresh_from_db()
    assert variante.stock == 3

    from apps.boutique.models import Commande

    commande = Commande.objects.get(id=resp.data["id"])
    assert commande.membre_id == membre_cible.id
    assert commande.paiement_confirme_par_id == df.id
    assert commande.date_paiement_confirme is not None


def test_vendre_especes_suit_le_statut_du_membre_cible_jamais_celui_du_staff(api_client):
    # Le Directeur Financier (staff) qui saisit la vente n'a lui-même aucune fiche membre — le
    # prix membre doit malgré tout s'appliquer, car c'est le statut de membre_cible qui compte.
    user, _df = _user_avec_membre(Role.DIR_FINANCIER, "df-prix-membre@example.de")
    membre_cible = MembreFactory(statut=StatutMembre.ACTIF)
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("15.00")
    variante.produit.prix_membre = Decimal("12.00")
    variante.produit.save(update_fields=["prix", "prix_membre"])

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 2},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("12.00")
    assert Decimal(resp.data["montant_total"]) == Decimal("24.00")


def test_vendre_especes_pour_un_membre_cible_non_actif_facture_le_prix_standard(api_client):
    user, _df = _user_avec_membre(Role.DIR_FINANCIER, "df-prix-standard@example.de")
    membre_cible = MembreFactory(statut=StatutMembre.INACTIF)
    variante = VarianteProduitFactory(stock=5)
    variante.produit.prix = Decimal("15.00")
    variante.produit.prix_membre = Decimal("12.00")
    variante.produit.save(update_fields=["prix", "prix_membre"])

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 1},
        format="json",
    )
    assert resp.status_code == 201, resp.data
    assert Decimal(resp.data["lignes"][0]["prix_unitaire"]) == Decimal("15.00")


def test_vendre_especes_refuse_a_un_role_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    membre_cible = MembreFactory()
    variante = VarianteProduitFactory(stock=5)

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 1},
        format="json",
    )

    assert resp.status_code == 403


def test_vendre_especes_refuse_si_stock_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df2@example.de")
    membre_cible = MembreFactory()
    variante = VarianteProduitFactory(stock=1)

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 2},
        format="json",
    )

    assert resp.status_code == 400
    variante.refresh_from_db()
    assert variante.stock == 1


def test_vendre_especes_produit_non_publie_refuse(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df3@example.de")
    membre_cible = MembreFactory()
    variante = VarianteProduitFactory(stock=5)
    variante.produit.statut = StatutProduit.ARCHIVE
    variante.produit.save(update_fields=["statut"])

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 1},
        format="json",
    )

    assert resp.status_code == 400


def test_admin_peut_vendre_especes(api_client):
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "admin-vendre-especes@example.de")
    membre_cible = MembreFactory()
    variante = VarianteProduitFactory(stock=5)

    resp = _auth(api_client, user).post(
        reverse(VENDRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "variante": str(variante.id), "quantite": 1},
        format="json",
    )

    assert resp.status_code == 201, resp.data


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Shop-Verwaltung" (page_boutique) désormais
# pilotée par apps.rbac (real enforcement, y compris pour les rôles système eux-mêmes — voir
# apps.rbac.services.has_admin_page_access). Couvre CatalogueBoutiquePermission (écriture
# catalogue) ET CommandePermission.GESTION_ACTIONS (changer_statut) — même page. NE couvre PAS
# confirmer_paiement/expedier (PAIEMENT_EXPEDITION_MIN_LEVEL, resté hartcodé Directeur
# Financier+, hors scope Phase D).
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_bureau_admin_perd_lacces_au_catalogue_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_boutique", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-boutique-restrict@example.de")

    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL), {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"}
    )
    assert resp.status_code == 403


def test_phase_d_bureau_admin_perd_lacces_a_changer_statut_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_boutique", NiveauAcces.AUCUN)
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-boutique-statut-restrict@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "phased-boutique-m1@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.EN_PREPARATION}
    )
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_gerer_le_catalogue_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-boutique-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="boutique-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_boutique", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL), {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"}
    )
    assert resp.status_code == 201


def test_phase_d_super_admin_gere_toujours_le_catalogue_meme_si_matrice_dit_aucun(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_boutique", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "phased-boutique-super@example.de")

    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL), {"nom": "Maillot", "categorie": "vetements", "prix": "30.00"}
    )
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Phase D — distinction lecture/écriture réelle (2026-09-24) — apps.rbac.services.
# has_admin_page_access(required=...) pour page_boutique : CatalogueBoutiquePermission
# (Produit), CommandePermission.GESTION_ACTIONS (changer_statut) et RetourPermission (création
# d'un retour). Les tests Phase D ci-dessus couvrent le retrait/octroi TOTAL d'accès (AUCUN vs
# LECTURE_ECRITURE) ; ceux-ci couvrent spécifiquement LECTURE SEULE — le cas exact du bug
# original (voir apps.communaute.tests.test_api pour le rapport utilisateur complet, page_quiz,
# et apps.rbac.services.has_admin_page_access pour le mécanisme).
# ---------------------------------------------------------------------------


def _assigner_role_perso(user, module_slug, niveau_acces):
    """Voir apps.communaute.tests.test_api._assigner_role_perso — même helper, dupliqué ici
    plutôt que partagé entre apps de test (pas de module de tests communs dans ce projet)."""
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    role_perso = RoleDefinitionFactory()
    RoleModulePermissionFactory(role=role_perso, module=module_slug, niveau_acces=niveau_acces)
    UserRoleAssignmentFactory(user=user, role=role_perso)
    return role_perso


# --- CatalogueBoutiquePermission (Produit) ----------------------------------------------


def test_phase_d_lecture_seule_page_boutique_permet_de_lister_le_catalogue(api_client):
    from apps.rbac.models import NiveauAcces

    ProduitFactory(statut=StatutProduit.PUBLIE)
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-boutique-read@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(reverse(PRODUIT_LIST_URL))
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_boutique_refuse_creation_produit(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-boutique-write@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot interdit", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_boutique_permet_creation_produit(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-boutique-write-ok@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(
        reverse(PRODUIT_LIST_URL),
        {"nom": "Maillot autorisé", "categorie": "vetements", "prix": "30.00"},
    )
    assert resp.status_code == 201


# --- CommandePermission.GESTION_ACTIONS (changer_statut) -------------------------------


def test_phase_d_bureau_admin_lecture_seule_page_boutique_refuse_changer_statut(api_client):
    """Bureau Admin (rôle système, dont has_object_permission passe déjà via ROLE_LEVELS >=
    ORDER_VISIBILITY_MIN_LEVEL, indépendamment de la matrice) avec SEULEMENT `lecture` sur
    page_boutique ne doit plus pouvoir changer le statut d'une commande — reproduit le même
    bug que QuizPermission mais côté CommandePermission."""
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_boutique", NiveauAcces.LECTURE)
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-rw-boutique-statut@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "phased-rw-boutique-m1@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.EN_PREPARATION}
    )
    assert resp.status_code == 403


def test_phase_d_bureau_admin_lecture_ecriture_page_boutique_permet_changer_statut(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_boutique", NiveauAcces.LECTURE_ECRITURE)
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-rw-boutique-statut-ok@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "phased-rw-boutique-m2@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.CONFIRMEE)

    resp = _auth(api_client, admin).post(
        _changer_statut_url(commande), {"statut": StatutCommande.EN_PREPARATION}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCommande.EN_PREPARATION


# --- RetourPermission (création d'un retour) --------------------------------------------


def test_phase_d_lecture_seule_page_boutique_permet_de_lister_les_retours(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-retour-read@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(reverse(RETOUR_LIST_URL))
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_boutique_refuse_creation_retour(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-retour-write@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE)
    _, membre = _user_avec_membre(Role.MEMBRE, "phased-rw-retour-m1@example.de")
    variante = VarianteProduitFactory(stock=1)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, user).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_boutique_permet_creation_retour(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-retour-write-ok@example.de")
    _assigner_role_perso(user, "page_boutique", NiveauAcces.LECTURE_ECRITURE)
    _, membre = _user_avec_membre(Role.MEMBRE, "phased-rw-retour-m2@example.de")
    variante = VarianteProduitFactory(stock=1)
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EXPEDIEE)
    ligne = LigneCommandeFactory(commande=commande, variante=variante, quantite=2)

    resp = _auth(api_client, user).post(
        reverse(RETOUR_LIST_URL),
        {
            "commande": str(commande.id),
            "ligne_commande": str(ligne.id),
            "quantite": 1,
            "motif": "autre",
        },
        format="json",
    )
    assert resp.status_code == 201


# --- Filtres commandes : date_apres/date_avant, destinataire (demande utilisateur du
# 2026-09-25, module "Shop-Verwaltung" : "Filtermöglichkeiten hinzufügen z.B. Datumsintervall,
# Empfänger") ---


def test_filtre_commandes_par_destinataire(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "filtre-dest-admin@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "filtre-dest-m1@example.de")
    CommandeFactory(membre=membre, nom_destinataire="Sana Werfelli")
    CommandeFactory(membre=membre, nom_destinataire="Karim Jomaa")

    resp = _auth(api_client, admin).get(reverse(COMMANDE_LIST_URL), {"destinataire": "sana"})
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["nom_destinataire"] == "Sana Werfelli"


def test_filtre_commandes_par_intervalle_de_dates(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "filtre-date-admin@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "filtre-date-m1@example.de")
    ancienne = CommandeFactory(membre=membre)
    recente = CommandeFactory(membre=membre)
    # auto_now_add=True : passer created_at au factory n'a aucun effet, voir
    # apps.communaute.tests.test_api (même contournement — .update() bypass save()/pre_save).
    Commande.objects.filter(id=ancienne.id).update(
        created_at=timezone.now() - timezone.timedelta(days=30)
    )

    resp = _auth(api_client, admin).get(
        reverse(COMMANDE_LIST_URL),
        {"date_apres": (timezone.now() - timezone.timedelta(days=1)).date().isoformat()},
    )
    assert resp.status_code == 200
    ids = {r["id"] for r in resp.data["results"]}
    assert ids == {str(recente.id)}


# --- Documents PDF : confirmation (Bestellbestätigung) / facture (Rechnung), demande
# utilisateur du 2026-09-25, module "Shop-Verwaltung" ---


def _confirmation_url(commande):
    return reverse("boutique:commande-confirmation", args=[commande.id])


def _facture_url(commande):
    return reverse("boutique:commande-facture", args=[commande.id])


def test_confirmation_pdf_disponible_pour_le_proprietaire_meme_en_attente(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "pdf-conf-m1@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)
    LigneCommandeFactory(commande=commande)

    resp = _auth(api_client, user).get(_confirmation_url(commande))
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")


def test_confirmation_pdf_disponible_pour_bureau_admin(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "pdf-conf-admin@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "pdf-conf-m2@example.de")
    commande = CommandeFactory(membre=membre)

    resp = _auth(api_client, admin).get(_confirmation_url(commande))
    assert resp.status_code == 200


def test_confirmation_pdf_refuse_pour_un_autre_membre(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "pdf-conf-m3@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "pdf-conf-m4@example.de")
    commande = CommandeFactory(membre=membre2)

    resp = _auth(api_client, user1).get(_confirmation_url(commande))
    assert resp.status_code in (403, 404)


def test_facture_pdf_refuse_si_paiement_non_confirme(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "pdf-fact-m1@example.de")
    commande = CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE)

    resp = _auth(api_client, user).get(_facture_url(commande))
    assert resp.status_code == 400


def test_facture_pdf_disponible_apres_confirmation_paiement(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "pdf-fact-m2@example.de")
    commande = CommandeFactory(
        membre=membre,
        statut=StatutCommande.CONFIRMEE,
        mode_paiement="virement",
        date_paiement_confirme=timezone.now(),
    )
    LigneCommandeFactory(commande=commande)

    resp = _auth(api_client, user).get(_facture_url(commande))
    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")


def test_facture_pdf_refuse_pour_un_autre_membre(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "pdf-fact-m3@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "pdf-fact-m4@example.de")
    commande = CommandeFactory(
        membre=membre2,
        statut=StatutCommande.CONFIRMEE,
        mode_paiement="virement",
        date_paiement_confirme=timezone.now(),
    )

    resp = _auth(api_client, user1).get(_facture_url(commande))
    assert resp.status_code in (403, 404)


# --- Export Excel (demande utilisateur du 2026-09-25) ---


def _export_url():
    return reverse("boutique:commande-export")


def test_export_commandes_retourne_un_classeur_xlsx(api_client):
    from openpyxl import load_workbook

    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "export-admin1@example.de")
    _, membre1 = _user_avec_membre(Role.MEMBRE, "export-m1@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "export-m2@example.de")
    CommandeFactory(membre=membre1, nom_destinataire="Export Un")
    CommandeFactory(membre=membre2, nom_destinataire="Export Deux")

    resp = _auth(api_client, admin).get(_export_url())
    assert resp.status_code == 200
    assert resp["Content-Type"] == (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    classeur = load_workbook(io.BytesIO(resp.content))
    feuille = classeur.active
    entetes = [c.value for c in feuille[1]]
    assert entetes[0] == "N° commande"
    destinataires = {feuille.cell(row=r, column=2).value for r in (2, 3)}
    assert destinataires == {"Export Un", "Export Deux"}


def test_export_commandes_respecte_le_filtre_statut(api_client):
    from openpyxl import load_workbook

    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "export-admin2@example.de")
    _, membre = _user_avec_membre(Role.MEMBRE, "export-m3@example.de")
    CommandeFactory(membre=membre, statut=StatutCommande.EN_ATTENTE, nom_destinataire="Attente")
    CommandeFactory(membre=membre, statut=StatutCommande.ANNULEE, nom_destinataire="Annulee")

    resp = _auth(api_client, admin).get(_export_url(), {"statut": StatutCommande.EN_ATTENTE})
    assert resp.status_code == 200

    classeur = load_workbook(io.BytesIO(resp.content))
    feuille = classeur.active
    assert feuille.max_row == 2  # en-tête + 1 seule commande
    assert feuille.cell(row=2, column=2).value == "Attente"


def test_export_commandes_scope_membre_ne_voit_que_les_siennes(api_client):
    from openpyxl import load_workbook

    user, membre1 = _user_avec_membre(Role.MEMBRE, "export-m4@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "export-m5@example.de")
    CommandeFactory(membre=membre1, nom_destinataire="Mine")
    CommandeFactory(membre=membre2, nom_destinataire="PasMoi")

    resp = _auth(api_client, user).get(_export_url())
    assert resp.status_code == 200

    classeur = load_workbook(io.BytesIO(resp.content))
    feuille = classeur.active
    assert feuille.max_row == 2
    assert feuille.cell(row=2, column=2).value == "Mine"

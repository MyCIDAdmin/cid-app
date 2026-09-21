"""
Tests API — app adhesions (FDD §6.1, SCD §2.3 A01 : IDOR sur les endpoints de souscription).
"""

import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.adhesions.models import OffreAdhesion, RabaisOffre, StatutCampagne, StatutSouscription
from apps.adhesions.tests.factories import (
    CampagneAdhesionFactory,
    OffreAdhesionFactory,
    RabaisOffreFactory,
    SouscriptionFactory,
)
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


CAMPAGNE_LIST_URL = "adhesions:campagne-list"
OFFRE_LIST_URL = "adhesions:offre-list"
SOUSCRIPTION_LIST_URL = "adhesions:souscription-list"


def _campagne_detail_url(campagne):
    return reverse("adhesions:campagne-detail", args=[campagne.id])


def _campagne_publier_url(campagne):
    return reverse("adhesions:campagne-publier", args=[campagne.id])


def _campagne_cloturer_url(campagne):
    return reverse("adhesions:campagne-cloturer", args=[campagne.id])


def _souscription_detail_url(souscription):
    return reverse("adhesions:souscription-detail", args=[souscription.id])


SOUSCRIRE_URL = "adhesions:souscription-souscrire"
MES_SOUSCRIPTIONS_URL = "adhesions:souscription-mes-souscriptions"


# --- Authentification ---


def test_list_campagnes_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(CAMPAGNE_LIST_URL))
    assert resp.status_code == 401


def test_souscrire_non_authentifie_refuse(api_client):
    resp = api_client.post(reverse(SOUSCRIRE_URL), {})
    assert resp.status_code == 401


# --- Catalogue : lecture ouverte, écriture Bureau Admin+ ---


def test_membre_peut_lister_les_campagnes(api_client):
    CampagneAdhesionFactory.create_batch(2)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(CAMPAGNE_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_membre_ne_peut_pas_creer_de_campagne(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(CAMPAGNE_LIST_URL),
        {
            "nom": "Adhésion 2027",
            "annee": 2027,
            "date_debut": "2027-01-01",
            "date_fin": "2027-12-31",
        },
    )

    assert resp.status_code == 403


def test_bureau_admin_peut_creer_une_campagne(api_client):
    user, membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(CAMPAGNE_LIST_URL),
        {
            "nom": "Adhésion 2027",
            "annee": 2027,
            "date_debut": "2027-01-01",
            "date_fin": "2027-12-31",
        },
    )

    assert resp.status_code == 201, resp.data
    assert str(resp.data["created_by"]) == str(membre.id)
    assert resp.data["statut"] == StatutCampagne.BROUILLON  # jamais publiée directement


def test_membre_ne_peut_pas_creer_d_offre(api_client):
    campagne = CampagneAdhesionFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(OFFRE_LIST_URL),
        {"campagne": str(campagne.id), "nom": "Basic", "prix_plein": "50.00"},
    )

    assert resp.status_code == 403


def test_offres_masquees_invisibles_pour_un_membre(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.PUBLIEE)
    OffreAdhesionFactory(campagne=campagne, visible=True)
    OffreAdhesionFactory(campagne=campagne, visible=False)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(OFFRE_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1


def test_offres_masquees_visibles_pour_bureau_admin(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.PUBLIEE)
    OffreAdhesionFactory(campagne=campagne, visible=True)
    OffreAdhesionFactory(campagne=campagne, visible=False)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse(OFFRE_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


# --- Cycle de vie d'une campagne ---


def test_active_renvoie_la_campagne_publiee(api_client):
    CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON, annee=2025)
    publiee = CampagneAdhesionFactory(statut=StatutCampagne.PUBLIEE, annee=2026)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse("adhesions:campagne-active"))

    assert resp.status_code == 200
    assert resp.data["id"] == str(publiee.id)


def test_active_404_si_aucune_campagne_publiee(api_client):
    CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.get(reverse("adhesions:campagne-active"))

    assert resp.status_code == 404


def test_publier_brouillon(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON, annee=2030)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_publier_url(campagne))

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutCampagne.PUBLIEE


def test_publier_refuse_pour_un_membre(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON, annee=2030)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_publier_url(campagne))

    assert resp.status_code == 403


def test_publier_refuse_si_deja_publiee_ou_cloturee(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.CLOTUREE, annee=2030)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_publier_url(campagne))

    assert resp.status_code == 400


def test_publier_refuse_si_une_autre_campagne_deja_publiee_cette_annee(api_client):
    CampagneAdhesionFactory(statut=StatutCampagne.PUBLIEE, annee=2031)
    brouillon = CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON, annee=2031)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_publier_url(brouillon))

    assert resp.status_code == 400
    brouillon.refresh_from_db()
    assert brouillon.statut == StatutCampagne.BROUILLON  # inchangée


def test_cloturer_campagne_publiee(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.PUBLIEE, annee=2032)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_cloturer_url(campagne))

    assert resp.status_code == 200
    assert resp.data["statut"] == StatutCampagne.CLOTUREE


def test_cloturer_refuse_si_pas_publiee(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON, annee=2032)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(_campagne_cloturer_url(campagne))

    assert resp.status_code == 400


# --- Souscrire (prix/statut calculés côté serveur, CLAUDE.md §8) ---


def test_souscrire_sans_fiche_membre_refuse(api_client):
    user = User.objects.create_user(
        email="sans-fiche@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    offre = OffreAdhesionFactory()
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 400


def test_souscrire_offre_masquee_refuse(api_client):
    offre = OffreAdhesionFactory(visible=False)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 400


def test_souscrire_campagne_non_publiee_refuse(api_client):
    campagne = CampagneAdhesionFactory(statut=StatutCampagne.BROUILLON)
    offre = OffreAdhesionFactory(campagne=campagne, visible=True)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 400


def test_souscrire_sans_rabais(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 200, resp.data
    assert str(resp.data["membre"]) == str(membre.id)
    assert resp.data["statut"] == StatutSouscription.EN_ATTENTE_PAIEMENT
    assert str(resp.data["prix_paye"]) == "50.00"
    assert resp.data["snapshot_avantages"] == offre.avantages


def test_souscrire_prix_toujours_recalcule_cote_serveur(api_client):
    """Le client ne peut pas transmettre son propre prix — seul offre/rabais sont acceptés."""
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "prix_paye": "0.01"})

    assert resp.status_code == 200, resp.data
    assert str(resp.data["prix_paye"]) == "50.00"


def test_souscrire_avec_rabais_sans_justificatif(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais = RabaisOffreFactory(
        offre=offre,
        montant_reduction=Decimal("10.00"),
        pct_reduction=None,
        justificatif_requis=False,
    )
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)}
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutSouscription.EN_ATTENTE_PAIEMENT
    assert str(resp.data["prix_paye"]) == "40.00"


def test_souscrire_avec_rabais_necessitant_justificatif(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais = RabaisOffreFactory(
        offre=offre,
        montant_reduction=Decimal("10.00"),
        pct_reduction=None,
        justificatif_requis=True,
    )
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)}
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutSouscription.EN_ATTENTE_JUSTIFICATIF


def test_souscrire_rabais_d_une_autre_offre_refuse(api_client):
    offre = OffreAdhesionFactory()
    rabais_autre_offre = RabaisOffreFactory()  # rattaché à une autre offre
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais_autre_offre.id)}
    )

    assert resp.status_code == 400


def test_souscrire_hors_condition_age_refuse(api_client):
    offre = OffreAdhesionFactory(condition_age_min=18, condition_age_max=25)
    naissance = datetime.date.today().replace(year=datetime.date.today().year - 40)
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de", date_naissance=naissance)
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 400


def test_souscrire_deux_fois_met_a_jour_la_meme_ligne_pas_une_nouvelle(api_client):
    campagne = CampagneAdhesionFactory()
    offre1 = OffreAdhesionFactory(campagne=campagne, prix_plein=Decimal("50.00"))
    offre2 = OffreAdhesionFactory(campagne=campagne, prix_plein=Decimal("80.00"))
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp1 = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre1.id)})
    resp2 = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre2.id)})

    assert resp1.status_code == 200
    assert resp2.status_code == 200, resp2.data
    assert resp1.data["id"] == resp2.data["id"]  # même souscription, mise à jour
    assert str(resp2.data["prix_paye"]) == "80.00"

    from apps.adhesions.models import Souscription

    assert Souscription.objects.filter(membre=membre, campagne=campagne).count() == 1


# --- Synchronisation Cotisation liée (ajouté le 2026-09-19, retour utilisateur : "Die Zahlung
# taucht nicht im Modul Ausstehende Zahlungen") — voir apps.adhesions.services.synchroniser_
# cotisation, appelée depuis souscrire()/valider()/annuler().


def test_souscrire_en_attente_paiement_cree_une_cotisation_liee(api_client):
    from apps.cotisations.models import StatutCotisation, TypeArticle

    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 200, resp.data
    from apps.adhesions.models import Souscription

    souscription = Souscription.objects.get(id=resp.data["id"])
    assert souscription.cotisation is not None
    assert souscription.cotisation.membre_id == membre.id
    assert souscription.cotisation.type_article == TypeArticle.ADHESION
    assert souscription.cotisation.statut == StatutCotisation.EN_ATTENTE
    assert str(souscription.cotisation.montant) == "50.00"


def test_souscrire_avec_justificatif_requis_ne_cree_pas_encore_de_cotisation(api_client):
    """Le paiement n'est pas encore dû tant que le justificatif n'est pas approuvé — voir
    test_valider_justificatif_approuve_cree_la_cotisation_liee ci-dessous."""
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))
    rabais = RabaisOffreFactory(
        offre=offre,
        montant_reduction=Decimal("10.00"),
        pct_reduction=None,
        justificatif_requis=True,
    )
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(SOUSCRIRE_URL), {"offre": str(offre.id), "rabais": str(rabais.id)}
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["cotisation"] is None


def test_souscrire_deux_fois_met_a_jour_la_meme_cotisation_pas_une_nouvelle(api_client):
    campagne = CampagneAdhesionFactory()
    offre1 = OffreAdhesionFactory(campagne=campagne, prix_plein=Decimal("50.00"))
    offre2 = OffreAdhesionFactory(campagne=campagne, prix_plein=Decimal("80.00"))
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp1 = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre1.id)})
    resp2 = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre2.id)})

    assert resp1.status_code == 200, resp1.data
    assert resp2.status_code == 200, resp2.data
    assert resp1.data["cotisation"] == resp2.data["cotisation"]  # même écriture mise à jour

    from apps.cotisations.models import Cotisation

    assert Cotisation.objects.filter(membre=membre, type_article="adhesion").count() == 1
    cotisation = Cotisation.objects.get(membre=membre, type_article="adhesion")
    assert str(cotisation.montant) == "80.00"


def test_souscription_deja_payee_ne_peut_plus_etre_modifiee(api_client):
    campagne = CampagneAdhesionFactory()
    offre = OffreAdhesionFactory(campagne=campagne)
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    SouscriptionFactory(
        membre=membre, offre=offre, campagne=campagne, statut=StatutSouscription.PAYEE
    )
    _auth(api_client, user)

    resp = api_client.post(reverse(SOUSCRIRE_URL), {"offre": str(offre.id)})

    assert resp.status_code == 403


# --- Liste / IDOR (SCD §2.3 A01) ---


def test_membre_ne_voit_que_ses_propres_souscriptions(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    SouscriptionFactory(membre=membre)
    SouscriptionFactory()  # une autre fiche
    _auth(api_client, user)

    resp = api_client.get(reverse(SOUSCRIPTION_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre.id)


def test_membre_ne_peut_pas_recuperer_la_souscription_dun_autre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    souscription_autrui = SouscriptionFactory()
    _auth(api_client, user)

    resp = api_client.get(_souscription_detail_url(souscription_autrui))

    assert resp.status_code == 404


def test_rh_liste_toutes_les_souscriptions(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    SouscriptionFactory.create_batch(3)
    _auth(api_client, user)

    resp = api_client.get(reverse(SOUSCRIPTION_LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 3


def test_mes_souscriptions_toujours_scope_a_soi_meme_meme_pour_rh(api_client):
    user, membre = _user_avec_membre(Role.RH, "rh@example.de")
    SouscriptionFactory(membre=membre)
    SouscriptionFactory.create_batch(2)  # d'autres membres — la RH les voit via /souscriptions/
    _auth(api_client, user)

    resp = api_client.get(reverse(MES_SOUSCRIPTIONS_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre.id)


# --- Registre quasi append-only : pas d'update/destroy exposés ---


def test_update_souscription_non_autorise(api_client):
    user, membre = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(membre=membre)
    _auth(api_client, user)

    resp = api_client.patch(_souscription_detail_url(souscription), {"statut": "payee"})

    assert resp.status_code == 405


def test_delete_souscription_non_autorise(api_client):
    user, membre = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(membre=membre)
    _auth(api_client, user)

    resp = api_client.delete(_souscription_detail_url(souscription))

    assert resp.status_code == 405


# --- Gestion du catalogue (Offres/Rabais) : CRUD Bureau Admin+ — demande utilisateur du
# 2026-09-16 (tool frontend analogue au Django Admin, la création existait déjà côté API). ---


def _offre_detail_url(offre):
    return reverse("adhesions:offre-detail", args=[offre.id])


def _rabais_detail_url(rabais):
    return reverse("adhesions:rabais-detail", args=[rabais.id])


def test_bureau_admin_modifie_une_offre(api_client):
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"), visible=True)
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.patch(_offre_detail_url(offre), {"prix_plein": "60.00", "visible": False})

    assert resp.status_code == 200, resp.data
    offre.refresh_from_db()
    assert str(offre.prix_plein) == "60.00"
    assert offre.visible is False


def test_bureau_admin_supprime_une_offre(api_client):
    offre = OffreAdhesionFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.delete(_offre_detail_url(offre))

    assert resp.status_code == 204
    assert not OffreAdhesion.objects.filter(id=offre.id).exists()


def test_membre_ne_peut_pas_modifier_ni_supprimer_une_offre(api_client):
    offre = OffreAdhesionFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp_patch = api_client.patch(_offre_detail_url(offre), {"prix_plein": "1.00"})
    resp_delete = api_client.delete(_offre_detail_url(offre))

    assert resp_patch.status_code == 403
    assert resp_delete.status_code == 403


def test_bureau_admin_cree_modifie_et_supprime_un_rabais(api_client):
    offre = OffreAdhesionFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp_creer = api_client.post(
        reverse("adhesions:rabais-list"),
        {
            "offre": str(offre.id),
            "type_rabais": "etudiant",
            "label_fr": "Réduction étudiant",
            "montant_reduction": "10.00",
            "justificatif_requis": True,
            "instructions_fr": "Carte étudiante en cours de validité.",
        },
    )
    assert resp_creer.status_code == 201, resp_creer.data
    rabais_id = resp_creer.data["id"]

    resp_modifier = api_client.patch(
        reverse("adhesions:rabais-detail", args=[rabais_id]), {"montant_reduction": "15.00"}
    )
    assert resp_modifier.status_code == 200, resp_modifier.data
    assert str(resp_modifier.data["montant_reduction"]) == "15.00"

    resp_supprimer = api_client.delete(reverse("adhesions:rabais-detail", args=[rabais_id]))
    assert resp_supprimer.status_code == 204
    assert not RabaisOffre.objects.filter(id=rabais_id).exists()


def test_creer_rabais_montant_et_pourcentage_simultanes_refuse(api_client):
    offre = OffreAdhesionFactory()
    user, _membre = _user_avec_membre(Role.BUREAU_ADMIN, "admin@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse("adhesions:rabais-list"),
        {
            "offre": str(offre.id),
            "type_rabais": "etudiant",
            "label_fr": "Réduction étudiant",
            "montant_reduction": "10.00",
            "pct_reduction": "10.00",
        },
    )

    assert resp.status_code == 400


def test_membre_ne_peut_pas_gerer_les_rabais(api_client):
    rabais = RabaisOffreFactory()
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp_creer = api_client.post(
        reverse("adhesions:rabais-list"),
        {"offre": str(rabais.offre_id), "type_rabais": "autre", "label_fr": "x"},
    )
    resp_supprimer = api_client.delete(_rabais_detail_url(rabais))

    assert resp_creer.status_code == 403
    assert resp_supprimer.status_code == 403


# --- Annulation (stornieren/zurückziehen) — demande utilisateur du 2026-09-16 ---


ANNULER_URL_NAME = "adhesions:souscription-annuler"


def _annuler_url(souscription):
    return reverse(ANNULER_URL_NAME, args=[souscription.id])


def test_membre_retire_sa_propre_souscription_non_payee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(membre=membre, statut=StatutSouscription.EN_ATTENTE_PAIEMENT)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 200, resp.data
    souscription.refresh_from_db()
    assert souscription.statut == StatutSouscription.ANNULEE


def test_membre_ne_peut_pas_retirer_la_souscription_dun_autre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription_autrui = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_PAIEMENT)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription_autrui))

    assert resp.status_code == 404  # IDOR : get_queryset() exclut déjà la souscription d'autrui
    souscription_autrui.refresh_from_db()
    assert souscription_autrui.statut == StatutSouscription.EN_ATTENTE_PAIEMENT


def test_membre_ne_peut_pas_retirer_une_souscription_deja_payee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    souscription = SouscriptionFactory(membre=membre, statut=StatutSouscription.PAYEE)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 400
    souscription.refresh_from_db()
    assert souscription.statut == StatutSouscription.PAYEE


def test_annuler_annule_la_cotisation_liee_non_payee(api_client):
    """Ajouté le 2026-09-19 — voir apps.adhesions.services.synchroniser_cotisation : un paiement
    qui n'est plus dû ne doit plus apparaître dans "Ausstehende Zahlungen"."""
    from apps.cotisations.models import StatutCotisation
    from apps.cotisations.tests.factories import CotisationFactory

    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    cotisation = CotisationFactory(membre=membre, statut=StatutCotisation.EN_ATTENTE)
    souscription = SouscriptionFactory(
        membre=membre, cotisation=cotisation, statut=StatutSouscription.EN_ATTENTE_PAIEMENT
    )
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 200, resp.data
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.ANNULEE


def test_rh_annule_la_souscription_dun_membre(api_client):
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 200, resp.data
    souscription.refresh_from_db()
    assert souscription.statut == StatutSouscription.ANNULEE


def test_rh_annule_la_souscription_dun_membre_le_notifie(api_client):
    """Ajouté le 2026-09-16 — voir notifications.notifier_souscription_annulee : le membre est
    notifié quand c'est RH+ qui annule (stornieren), jamais quand il annule lui-même."""
    user_rh, _rh = _user_avec_membre(Role.RH, "rh-annule@example.de")
    user_membre, membre = _user_avec_membre(Role.MEMBRE, "membre-annule@example.de")
    souscription = SouscriptionFactory(
        membre=membre, statut=StatutSouscription.EN_ATTENTE_JUSTIFICATIF
    )
    _auth(api_client, user_rh)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 200, resp.data
    notification = Notification.objects.get(destinataire=user_membre)
    assert notification.type_notification == TypeNotification.ADHESION_SOUSCRIPTION_ANNULEE


def test_membre_qui_retire_sa_propre_souscription_nest_pas_notifie(api_client):
    """Ajouté le 2026-09-16 — pas besoin d'informer un membre de sa propre action
    (zurückziehen), voir notifications.notifier_souscription_annulee."""
    user, membre = _user_avec_membre(Role.MEMBRE, "membre-zuruck@example.de")
    souscription = SouscriptionFactory(membre=membre, statut=StatutSouscription.EN_ATTENTE_PAIEMENT)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 200, resp.data
    assert Notification.objects.filter(destinataire=user).count() == 0


def test_rh_ne_peut_pas_annuler_une_souscription_deja_payee(api_client):
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(statut=StatutSouscription.PAYEE)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 400
    souscription.refresh_from_db()
    assert souscription.statut == StatutSouscription.PAYEE


def test_annuler_une_souscription_deja_annulee_refuse(api_client):
    user, _rh = _user_avec_membre(Role.RH, "rh@example.de")
    souscription = SouscriptionFactory(statut=StatutSouscription.ANNULEE)
    _auth(api_client, user)

    resp = api_client.post(_annuler_url(souscription))

    assert resp.status_code == 400


# --- Souscription payée en espèces par le Directeur Financier/Admin (ajoutée le 2026-09-21,
# retour utilisateur : "Füge mitgliedschaftsbeitrag hinzu mit den aktuellen Angebote", dans le
# formulaire "Barzahlung eintragen" de CotisationsEnAttentePage) — voir
# SouscriptionViewSet.souscrire_especes.

SOUSCRIRE_ESPECES_URL = "adhesions:souscription-souscrire-especes"


def test_df_souscrit_pour_un_autre_membre_et_confirme_le_paiement_en_especes(api_client):
    from apps.cotisations.models import (
        Cotisation,
        HistoriqueStatutCotisation,
        ModePaiement,
        StatutCotisation,
        TypeArticle,
    )

    user, _df = _user_avec_membre(Role.DIR_FINANCIER, "df1@example.de")
    membre_cible = MembreFactory()
    offre = OffreAdhesionFactory(prix_plein=Decimal("50.00"))

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutSouscription.PAYEE

    from apps.adhesions.models import Souscription

    souscription = Souscription.objects.get(id=resp.data["id"])
    assert souscription.membre_id == membre_cible.id
    assert souscription.statut == StatutSouscription.PAYEE
    assert str(souscription.prix_paye) == "50.00"

    cotisation = Cotisation.objects.get(id=souscription.cotisation_id)
    assert cotisation.type_article == TypeArticle.ADHESION
    assert cotisation.statut == StatutCotisation.PAYEE
    assert cotisation.mode_paiement == ModePaiement.ESPECES
    assert str(cotisation.montant) == "50.00"

    historique = HistoriqueStatutCotisation.objects.get(cotisation=cotisation)
    assert historique.ancien_statut == StatutCotisation.EN_ATTENTE
    assert historique.nouveau_statut == StatutCotisation.PAYEE


def test_souscrire_especes_refuse_a_un_role_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    membre_cible = MembreFactory()
    offre = OffreAdhesionFactory()

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 403


def test_souscrire_especes_offre_masquee_refuse(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df2@example.de")
    membre_cible = MembreFactory()
    offre = OffreAdhesionFactory(visible=False)

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 400


def test_souscrire_especes_hors_condition_age_refuse(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df3@example.de")
    membre_cible = MembreFactory(
        date_naissance=datetime.date.today().replace(year=datetime.date.today().year - 40)
    )
    offre = OffreAdhesionFactory(condition_age_max=17)

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 400


def test_souscrire_especes_deja_payee_refuse(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df4@example.de")
    campagne = CampagneAdhesionFactory()
    offre = OffreAdhesionFactory(campagne=campagne)
    membre_cible = MembreFactory()
    SouscriptionFactory(
        membre=membre_cible, offre=offre, campagne=campagne, statut=StatutSouscription.PAYEE
    )

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 403


def test_admin_peut_souscrire_especes(api_client):
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "admin-souscrire-especes@example.de")
    membre_cible = MembreFactory()
    offre = OffreAdhesionFactory(prix_plein=Decimal("10.00"))

    resp = _auth(api_client, user).post(
        reverse(SOUSCRIRE_ESPECES_URL),
        {"membre": str(membre_cible.id), "offre": str(offre.id)},
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutSouscription.PAYEE

"""Tests API — app evenements (FDD §2.2/§3.4, SCD §2.3 A01 : IDOR)."""

from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.evenements.models import StatutEvenement, StatutInscription
from apps.evenements.tests.factories import CovoiturageFactory, EvenementFactory, InscriptionFactory
from apps.membres.tests.factories import MembreFactory

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


EVENEMENT_LIST_URL = "evenements:evenement-list"
INSCRIRE_URL = "evenements:evenement-inscrire"
INSCRIPTION_LIST_URL = "evenements:inscription-list"
COVOITURAGE_LIST_URL = "evenements:covoiturage-list"


def _evenement_detail_url(evenement):
    return reverse("evenements:evenement-detail", args=[evenement.id])


def _publier_url(evenement):
    return reverse("evenements:evenement-publier", args=[evenement.id])


def _inscription_annuler_url(inscription):
    return reverse("evenements:inscription-annuler", args=[inscription.id])


def _rejoindre_url(trajet):
    return reverse("evenements:covoiturage-rejoindre", args=[trajet.id])


# --- Permissions catalogue événements ---


def test_list_evenements_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(EVENEMENT_LIST_URL))
    assert resp.status_code == 401


def test_membre_normal_ne_voit_pas_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m1@example.de")
    EvenementFactory(statut=StatutEvenement.BROUILLON, titre="Brouillon secret")
    EvenementFactory(statut=StatutEvenement.PUBLIE, titre="Publié visible")
    resp = _auth(api_client, user).get(reverse(EVENEMENT_LIST_URL))
    assert resp.status_code == 200
    titres = [e["titre"] for e in resp.data["results"]]
    assert "Publié visible" in titres
    assert "Brouillon secret" not in titres


def test_bureau_admin_voit_les_brouillons(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau@example.de")
    EvenementFactory(statut=StatutEvenement.BROUILLON, titre="Brouillon")
    resp = _auth(api_client, user).get(reverse(EVENEMENT_LIST_URL))
    titres = [e["titre"] for e in resp.data["results"]]
    assert "Brouillon" in titres


def test_membre_normal_ne_peut_pas_creer_evenement(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m2@example.de")
    resp = _auth(api_client, user).post(
        reverse(EVENEMENT_LIST_URL),
        {
            "titre": "Nouveau",
            "type_evenement": "fete",
            "description": "desc",
            "date_evenement": "2027-01-01",
            "lieu": "Berlin",
        },
    )
    assert resp.status_code == 403


def test_bureau_admin_peut_creer_et_publier_evenement(api_client):
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau2@example.de")
    resp = _auth(api_client, user).post(
        reverse(EVENEMENT_LIST_URL),
        {
            "titre": "Déplacement Munich",
            "type_evenement": "deplacement",
            "description": "desc",
            "date_evenement": "2027-01-01",
            "lieu": "Munich",
            "places_max": 40,
            "cout": "35.00",
        },
    )
    assert resp.status_code == 201
    assert resp.data["statut"] == StatutEvenement.BROUILLON

    resp2 = _auth(api_client, user).post(_publier_url(_Obj(resp.data["id"])))
    assert resp2.status_code == 200
    assert resp2.data["statut"] == StatutEvenement.PUBLIE


class _Obj:
    """Petit adaptateur pour réutiliser _publier_url(evenement) avec un id brut de réponse API."""

    def __init__(self, id):
        self.id = id


# --- Inscription : capacité, prix serveur, IDOR ---


def test_inscrire_calcule_le_montant_cote_serveur(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m3@example.de")
    evenement = EvenementFactory(cout=Decimal("35.00"), places_max=10)

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_URL),
        {"evenement": str(evenement.id), "places": 2, "montant_paye": "0.01"},
    )
    assert resp.status_code == 200
    # Le champ montant_paye envoyé par le client est ignoré : recalculé = cout * places.
    assert Decimal(resp.data["montant_paye"]) == Decimal("70.00")
    assert resp.data["statut"] == StatutInscription.EN_ATTENTE_PAIEMENT


def test_inscrire_gratuit_confirme_directement(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "m4@example.de")
    evenement = EvenementFactory(gratuit=True, cout=Decimal("0.00"), places_max=10)
    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )
    assert resp.status_code == 200
    assert resp.data["statut"] == StatutInscription.CONFIRMEE


def test_inscrire_refuse_si_capacite_insuffisante(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "m5@example.de")
    user2, _ = _user_avec_membre(Role.MEMBRE, "m6@example.de")
    evenement = EvenementFactory(places_max=3)

    resp1 = _auth(api_client, user1).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 3}
    )
    assert resp1.status_code == 200

    resp2 = _auth(api_client, user2).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )
    assert resp2.status_code == 400
    assert "places" in resp2.data["details"]


def test_annuler_inscription_libere_la_capacite(api_client):
    user1, _ = _user_avec_membre(Role.MEMBRE, "m7@example.de")
    user2, _ = _user_avec_membre(Role.MEMBRE, "m8@example.de")
    evenement = EvenementFactory(places_max=2)

    resp1 = _auth(api_client, user1).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 2}
    )
    inscription_id = resp1.data["id"]

    resp2 = _auth(api_client, user2).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )
    assert resp2.status_code == 400

    from apps.evenements.models import Inscription

    inscription = Inscription.objects.get(pk=inscription_id)
    resp_annuler = _auth(api_client, user1).post(_inscription_annuler_url(inscription))
    assert resp_annuler.status_code == 200

    resp3 = _auth(api_client, user2).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )
    assert resp3.status_code == 200


def test_membre_ne_voit_que_ses_propres_inscriptions(api_client):
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m9@example.de")
    user2, membre2 = _user_avec_membre(Role.MEMBRE, "m10@example.de")
    InscriptionFactory(membre=membre1)
    InscriptionFactory(membre=membre2)

    resp = _auth(api_client, user1).get(reverse(INSCRIPTION_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre1.id)


def test_bureau_admin_voit_toutes_les_inscriptions(api_client):
    admin, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau3@example.de")
    _, membre1 = _user_avec_membre(Role.MEMBRE, "m11@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m12@example.de")
    InscriptionFactory(membre=membre1)
    InscriptionFactory(membre=membre2)

    resp = _auth(api_client, admin).get(reverse(INSCRIPTION_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_annuler_inscription_dun_autre_membre_refuse(api_client):
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m13@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m14@example.de")
    inscription = InscriptionFactory(membre=membre2)

    resp = _auth(api_client, user1).post(_inscription_annuler_url(inscription))
    assert resp.status_code in (403, 404)


# --- Covoiturage ---


def test_rejoindre_son_propre_trajet_refuse(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "cond@example.de")
    trajet = CovoiturageFactory(conducteur=membre, places_disponibles=3)
    resp = _auth(api_client, user).post(_rejoindre_url(trajet), {"places_reservees": 1})
    assert resp.status_code == 403


def test_rejoindre_trajet_calcule_places_restantes(api_client):
    _, conducteur = _user_avec_membre(Role.MEMBRE, "cond2@example.de")
    trajet = CovoiturageFactory(conducteur=conducteur, places_disponibles=2)
    user, _ = _user_avec_membre(Role.MEMBRE, "passager@example.de")

    resp = _auth(api_client, user).post(_rejoindre_url(trajet), {"places_reservees": 2})
    assert resp.status_code == 200

    user2, _ = _user_avec_membre(Role.MEMBRE, "passager2@example.de")
    resp2 = _auth(api_client, user2).post(_rejoindre_url(trajet), {"places_reservees": 1})
    assert resp2.status_code == 400


def test_modifier_trajet_dun_autre_conducteur_refuse(api_client):
    _, conducteur = _user_avec_membre(Role.MEMBRE, "cond3@example.de")
    trajet = CovoiturageFactory(conducteur=conducteur)
    autre_user, _ = _user_avec_membre(Role.MEMBRE, "autre@example.de")

    resp = _auth(api_client, autre_user).patch(
        reverse("evenements:covoiturage-detail", args=[trajet.id]), {"places_disponibles": 1}
    )
    assert resp.status_code == 403

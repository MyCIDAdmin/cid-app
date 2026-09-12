"""Tests API — app vote (SCD §4.2 matrice de permissions, §7.5 résultats masqués)."""

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.vote.models import StatutSession, VoteExprime, VoteSession
from apps.vote.tests.factories import VoteOptionFactory, VoteSessionFactory, user_membre_avec_fiche

pytestmark = pytest.mark.django_db

LIST_URL = "vote:vote-session-list"


@pytest.fixture
def api_client():
    return APIClient()


def _user(role, email):
    return User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


def _detail_url(session):
    return reverse("vote:vote-session-detail", args=[session.id])


def _cloturer_url(session):
    return reverse("vote:vote-session-cloturer", args=[session.id])


def _resultats_url(session):
    return reverse("vote:vote-session-resultats", args=[session.id])


PAYLOAD_MINIMAL = {
    "titre": "Élection du Bureau",
    "description": "Choisissez le nouveau président.",
    "type_vote": "unique",
    "mode_anonymat": "anonyme",
    "nb_choix_max": 1,
    "eligibilite": "tous_actifs",
    "duree_minutes": 30,
    "options": [{"label": "Candidat A"}, {"label": "Candidat B"}],
}


# --- Permissions création / clôture (SCD §4.2 : Admin App + Bureau Admin uniquement) ---


def test_creation_non_authentifie_refuse(api_client):
    resp = api_client.post(reverse(LIST_URL), PAYLOAD_MINIMAL, format="json")
    assert resp.status_code == 401


def test_membre_normal_ne_peut_pas_creer_de_session(api_client):
    user = _user(Role.MEMBRE, "membre@example.de")
    resp = _auth(api_client, user).post(reverse(LIST_URL), PAYLOAD_MINIMAL, format="json")
    assert resp.status_code == 403


def test_dir_financier_ne_peut_pas_creer_de_session(api_client):
    user = _user(Role.DIR_FINANCIER, "df@example.de")
    resp = _auth(api_client, user).post(reverse(LIST_URL), PAYLOAD_MINIMAL, format="json")
    assert resp.status_code == 403


def test_bureau_admin_peut_creer_une_session_lancee_immediatement(api_client):
    user = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    resp = _auth(api_client, user).post(reverse(LIST_URL), PAYLOAD_MINIMAL, format="json")
    assert resp.status_code == 201
    assert resp.data["statut"] == StatutSession.OUVERTE
    assert len(resp.data["options"]) == 2
    session = VoteSession.objects.get(id=resp.data["id"])
    assert session.date_fin > timezone.now()
    # SCD §7.5 : le sel n'est jamais exposé, sous quelque forme que ce soit.
    assert "anonymat_sel" not in resp.data


def test_creation_refuse_moins_de_deux_options(api_client):
    user = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    payload = {**PAYLOAD_MINIMAL, "options": [{"label": "Seule option"}]}
    resp = _auth(api_client, user).post(reverse(LIST_URL), payload, format="json")
    assert resp.status_code == 400


def test_oui_non_exige_exactement_trois_options(api_client):
    user = _user(Role.BUREAU_ADMIN, "bureau@example.de")
    payload = {
        **PAYLOAD_MINIMAL,
        "type_vote": "oui_non",
        "options": [{"label": "Oui"}, {"label": "Non"}],
    }
    resp = _auth(api_client, user).post(reverse(LIST_URL), payload, format="json")
    assert resp.status_code == 400


def test_membre_normal_ne_peut_pas_cloturer(api_client):
    session = VoteSessionFactory()
    VoteOptionFactory(session=session)
    user = _user(Role.MEMBRE, "membre2@example.de")
    resp = _auth(api_client, user).post(_cloturer_url(session), format="json")
    assert resp.status_code == 403


def test_bureau_admin_peut_cloturer(api_client):
    session = VoteSessionFactory(statut=StatutSession.OUVERTE)
    user = _user(Role.BUREAU_ADMIN, "bureau3@example.de")
    resp = _auth(api_client, user).post(_cloturer_url(session), format="json")
    assert resp.status_code == 200
    session.refresh_from_db()
    assert session.statut == StatutSession.CLOTUREE
    assert session.date_cloture is not None


def test_cloturer_une_session_deja_cloturee_refuse(api_client):
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    user = _user(Role.BUREAU_ADMIN, "bureau4@example.de")
    resp = _auth(api_client, user).post(_cloturer_url(session), format="json")
    assert resp.status_code == 400


# --- Résultats (SCD §7.5 : cachés pendant la session active) ---


def test_resultats_masques_pendant_session_ouverte(api_client):
    session = VoteSessionFactory(statut=StatutSession.OUVERTE)
    user = _user(Role.BUREAU_ADMIN, "bureau5@example.de")
    resp = _auth(api_client, user).get(_resultats_url(session))
    assert resp.status_code == 403


def test_resultats_visibles_apres_cloture_pour_tout_authentifie(api_client):
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    opt = VoteOptionFactory(session=session)
    VoteExprime.objects.create(session=session, voter_token_hash="c" * 64)
    from apps.vote.models import ChoixExprime

    ChoixExprime.objects.create(bulletin=session.bulletins.first(), option=opt)
    _, membre = user_membre_avec_fiche(email="lecteur@example.de")
    resp = _auth(api_client, membre.user).get(_resultats_url(session))
    assert resp.status_code == 200
    assert resp.data["total_participants"] == 1
    assert "voter_token_hash" not in str(resp.data)


def test_resultats_non_authentifie_refuse(api_client):
    session = VoteSessionFactory(statut=StatutSession.CLOTUREE)
    resp = api_client.get(_resultats_url(session))
    assert resp.status_code == 401


# --- Liste / lecture ouverte à tout authentifié ---


def test_liste_accessible_a_tout_authentifie(api_client):
    VoteSessionFactory()
    _, membre = user_membre_avec_fiche(email="lecteur2@example.de")
    resp = _auth(api_client, membre.user).get(reverse(LIST_URL))
    assert resp.status_code == 200
    assert resp.data["count"] == 1

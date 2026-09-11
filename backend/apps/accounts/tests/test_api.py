import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import RegistrationDecision, Role, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def membre_actif():
    return User.objects.create_user(
        email="membre@example.com", password="Password123!", is_active=True
    )


def payload_inscription(**overrides):
    """Payload complet AHM-50 (mockup #sc-register) — email/password/prénom
    variables via **overrides pour éviter les collisions entre tests."""
    payload = {
        "email": "nouveau@example.com",
        "password": "Password123!",
        "langue_preferee": "fr",
        "consentement_rgpd": True,
        "prenom": "Sami",
        "nom": "Ben Salah",
        "date_naissance": "1990-05-12",
        "cin": "12345678",
        "telephone": "+49123456789",
        "adresse_de": "Friedrichstr. 42",
        "ville_de": "Berlin",
    }
    payload.update(overrides)
    return payload


def test_login_success_no_2fa(api_client, membre_actif):
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "membre@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert "access" in resp.data
    assert "refresh" in resp.data


def test_login_wrong_password(api_client, membre_actif):
    url = reverse("accounts:login")
    resp = api_client.post(url, {"email": "membre@example.com", "password": "wrong"}, format="json")
    assert resp.status_code == 401


def test_login_inactive_account(api_client):
    User.objects.create_user(email="inactif@example.com", password="Password123!")
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "inactif@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 403
    assert resp.data["code"] == "account_inactive"


def test_login_bureau_admin_requires_2fa(api_client):
    User.objects.create_user(
        email="bureau@example.com",
        password="Password123!",
        role=Role.BUREAU_ADMIN,
        is_active=True,
    )
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "bureau@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["requires_2fa"] is True
    assert "login_ticket" in resp.data


def test_me_requires_authentication(api_client):
    url = reverse("accounts:me")
    resp = api_client.get(url)
    assert resp.status_code == 401


def test_register_creates_inactive_member(api_client):
    from apps.membres.models import Membre, StatutMembre

    url = reverse("accounts:register")
    resp = api_client.post(url, payload_inscription(), format="json")
    assert resp.status_code == 201

    user = User.objects.get(email="nouveau@example.com")
    assert user.is_active is False
    assert user.email_verifie is False
    assert user.registration_decision == RegistrationDecision.EN_ATTENTE

    # AHM-50 : la fiche Membre est créée en même temps que le compte.
    membre = Membre.objects.get(user=user)
    assert membre.statut == StatutMembre.EN_ATTENTE
    assert membre.prenom == "Sami"
    assert membre.cin == "12345678"


def test_register_without_rgpd_consent_fails(api_client):
    url = reverse("accounts:register")
    resp = api_client.post(
        url,
        payload_inscription(email="nouveau2@example.com", consentement_rgpd=False),
        format="json",
    )
    assert resp.status_code == 400


def test_register_email_deja_utilise_echoue(api_client, membre_actif):
    url = reverse("accounts:register")
    resp = api_client.post(url, payload_inscription(email=membre_actif.email), format="json")
    assert resp.status_code == 400


def test_register_confirm_avec_code_valide_active_email_verifie(api_client):
    from apps.accounts import services

    api_client.post(reverse("accounts:register"), payload_inscription(), format="json")
    user = User.objects.get(email="nouveau@example.com")

    # Le code en clair envoyé par RegisterView n'est jamais stocké (seul son
    # hash l'est) — on en régénère un via le service pour le test, comme le
    # ferait un vrai renvoi de code ; verify_email_otp prend toujours le plus
    # récent OTP non consommé pour ce purpose, donc celui-ci fait foi.
    code = services.generate_email_otp(user, purpose="email_verification")

    resp = api_client.post(
        reverse("accounts:register-confirm"), {"email": user.email, "code": code}, format="json"
    )
    assert resp.status_code == 200
    user.refresh_from_db()
    assert user.email_verifie is True


def test_register_confirm_avec_code_invalide_echoue(api_client):
    api_client.post(reverse("accounts:register"), payload_inscription(), format="json")
    resp = api_client.post(
        reverse("accounts:register-confirm"),
        {"email": "nouveau@example.com", "code": "000000"},
        format="json",
    )
    assert resp.status_code == 400
    assert User.objects.get(email="nouveau@example.com").email_verifie is False


def test_register_resend_code_toujours_message_generique(api_client):
    api_client.post(reverse("accounts:register"), payload_inscription(), format="json")
    url = reverse("accounts:register-resend-code")

    resp_existant = api_client.post(url, {"email": "nouveau@example.com"}, format="json")
    resp_inexistant = api_client.post(url, {"email": "ne-existe-pas@example.com"}, format="json")
    assert resp_existant.status_code == resp_inexistant.status_code == 200
    assert resp_existant.data["message"] == resp_inexistant.data["message"]


def test_password_reset_request_existant_renvoie_message_generique(api_client, membre_actif):
    url = reverse("accounts:password-reset")
    resp = api_client.post(url, {"email": membre_actif.email}, format="json")
    assert resp.status_code == 200
    assert "message" in resp.data


def test_password_reset_request_inexistant_renvoie_le_meme_message(api_client, membre_actif):
    """Anti-énumération (SCD) : même réponse qu'un email existe ou non."""
    url = reverse("accounts:password-reset")
    resp_existant = api_client.post(url, {"email": membre_actif.email}, format="json")
    resp_inexistant = api_client.post(url, {"email": "ne-existe-pas@example.com"}, format="json")
    assert resp_existant.status_code == resp_inexistant.status_code == 200
    assert resp_existant.data["message"] == resp_inexistant.data["message"]


def test_password_reset_confirm_avec_jeton_valide_change_le_mot_de_passe(api_client, membre_actif):
    from apps.accounts import services

    token = services.generate_password_reset_token(membre_actif)
    url = reverse("accounts:password-reset-confirm")
    resp = api_client.post(url, {"token": token, "new_password": "NouveauMdp456!"}, format="json")
    assert resp.status_code == 200

    membre_actif.refresh_from_db()
    assert membre_actif.check_password("NouveauMdp456!")

    # Connexion possible avec le nouveau mot de passe.
    login_resp = api_client.post(
        reverse("accounts:login"),
        {"email": membre_actif.email, "password": "NouveauMdp456!"},
        format="json",
    )
    assert login_resp.status_code == 200


def test_password_reset_confirm_avec_jeton_invalide_echoue(api_client):
    url = reverse("accounts:password-reset-confirm")
    resp = api_client.post(
        url, {"token": "jeton-invalide", "new_password": "NouveauMdp456!"}, format="json"
    )
    assert resp.status_code == 400


def test_password_reset_confirm_jeton_deja_utilise_echoue(api_client, membre_actif):
    """Le jeton devient invalide dès que le mot de passe a changé (usage unique)."""
    from apps.accounts import services

    token = services.generate_password_reset_token(membre_actif)
    url = reverse("accounts:password-reset-confirm")

    premier = api_client.post(
        url, {"token": token, "new_password": "NouveauMdp456!"}, format="json"
    )
    assert premier.status_code == 200

    second = api_client.post(url, {"token": token, "new_password": "AutreMdp789!"}, format="json")
    assert second.status_code == 400


# --- AHM-48 : validation des inscriptions par RH/Admin ---


@pytest.fixture
def rh_user():
    return User.objects.create_user(
        email="rh@example.com", password="Password123!", role=Role.RH, is_active=True
    )


@pytest.fixture
def inscription_en_attente():
    """
    AHM-50 : une inscription "prête pour RH" a désormais toujours
    email_verifie=True et une fiche Membre liée (statut en_attente) — c'est
    exactement l'état obtenu après RegisterView + RegisterConfirmView.
    """
    from apps.membres.models import Membre, StatutMembre

    user = User.objects.create_user(
        email="candidat@example.com", password="Password123!", email_verifie=True
    )
    Membre.objects.create(
        user=user,
        email=user.email,
        prenom="Amine",
        nom="Trabelsi",
        date_naissance="1992-03-01",
        cin="87654321",
        telephone="+49987654321",
        adresse_de="Musterstr. 1",
        ville_de="Hamburg",
        statut=StatutMembre.EN_ATTENTE,
    )
    return user


def test_pending_registrations_visible_a_rh(api_client, rh_user, inscription_en_attente):
    api_client.force_authenticate(user=rh_user)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    assert resp.status_code == 200
    emails = [row["email"] for row in resp.data["results"]]
    assert "candidat@example.com" in emails
    ligne = next(row for row in resp.data["results"] if row["email"] == "candidat@example.com")
    assert ligne["prenom"] == "Amine"
    assert ligne["ville"] == "Hamburg"


def test_pending_registrations_email_non_confirme_invisible_a_rh(api_client, rh_user):
    """Une inscription dont l'email n'est pas encore confirmé n'est pas une
    vraie demande — RH ne doit pas la voir (AHM-50)."""
    User.objects.create_user(email="pas-confirme@example.com", password="Password123!")
    api_client.force_authenticate(user=rh_user)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    emails = [row["email"] for row in resp.data["results"]]
    assert "pas-confirme@example.com" not in emails


def test_pending_registrations_refuse_a_membre_normal(api_client, inscription_en_attente):
    membre = User.objects.create_user(
        email="membre-normal@example.com", password="Password123!", is_active=True
    )
    api_client.force_authenticate(user=membre)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    assert resp.status_code == 403


def test_approve_registration_active_le_compte(api_client, rh_user, inscription_en_attente):
    from apps.membres.models import StatutMembre

    api_client.force_authenticate(user=rh_user)
    url = reverse("accounts:pending-registration-approve", args=[inscription_en_attente.id])
    resp = api_client.post(url)
    assert resp.status_code == 200

    inscription_en_attente.refresh_from_db()
    assert inscription_en_attente.is_active is True
    assert inscription_en_attente.registration_decision == RegistrationDecision.APPROUVE
    # AHM-50 : la fiche Membre (créée à l'inscription) devient active — c'est
    # ce qui fait apparaître le membre dans /membres après acceptation.
    assert inscription_en_attente.membre.statut == StatutMembre.ACTIF

    # Le compte peut désormais se connecter.
    login_resp = api_client.post(
        reverse("accounts:login"),
        {"email": "candidat@example.com", "password": "Password123!"},
        format="json",
    )
    assert login_resp.status_code == 200


def test_refuse_registration_laisse_le_compte_inactif(api_client, rh_user, inscription_en_attente):
    from apps.membres.models import StatutMembre

    api_client.force_authenticate(user=rh_user)
    url = reverse("accounts:pending-registration-refuse", args=[inscription_en_attente.id])
    resp = api_client.post(url)
    assert resp.status_code == 200

    inscription_en_attente.refresh_from_db()
    assert inscription_en_attente.is_active is False
    assert inscription_en_attente.registration_decision == RegistrationDecision.REFUSE
    # AHM-50 : conservée (pas supprimée), passe à "inactif".
    assert inscription_en_attente.membre.statut == StatutMembre.INACTIF


def test_approve_registration_deja_traitee_echoue(api_client, rh_user, inscription_en_attente):
    api_client.force_authenticate(user=rh_user)
    url = reverse("accounts:pending-registration-approve", args=[inscription_en_attente.id])
    premier = api_client.post(url)
    assert premier.status_code == 200

    second = api_client.post(url)
    assert second.status_code == 400

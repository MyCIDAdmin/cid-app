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


def test_login_sans_fiche_membre_renvoie_prenom_nom_vides(api_client, membre_actif):
    """Un compte sans fiche Membre (ex. superuser, RH créé hors
    auto-inscription) ne doit pas faire planter la sérialisation — voir
    UserSerializer.get_prenom/get_nom (AHM-52)."""
    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "membre@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["user"]["prenom"] == ""
    assert resp.data["user"]["nom"] == ""


def test_login_avec_fiche_membre_renvoie_prenom_nom(api_client):
    """AHM-52 : le nom de famille est affiché en accueil frontend plutôt que
    l'email — il doit donc être disponible dès la réponse de login."""
    from apps.membres.tests.factories import MembreFactory

    user = User.objects.create_user(
        email="sami.bensalah@example.com", password="Password123!", is_active=True
    )
    MembreFactory(user=user, prenom="Sami", nom="Ben Salah")

    url = reverse("accounts:login")
    resp = api_client.post(
        url, {"email": "sami.bensalah@example.com", "password": "Password123!"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.data["user"]["prenom"] == "Sami"
    assert resp.data["user"]["nom"] == "Ben Salah"


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


# --- task #218 (2026-09-24) : "wenn ein Benutzer sich einloggt und eine Session auf einem
# Gerät aufmacht, müssen alle laufende Sessions im selben Gerät beendet werden" — une seule
# session active par appareil (identifié par `device_fingerprint`, déjà utilisé pour la
# détection "nouvel appareil" du 2FA conditionnel). Un refresh token révoqué reste valable
# jusqu'à sa prochaine utilisation (blacklist vérifié seulement au refresh, jamais sur l'access
# token en cours — même mécanisme que LogoutView) : on vérifie donc la révocation via
# /auth/token/refresh/, pas via une requête authentifiée classique.


def test_login_meme_appareil_revoque_la_session_precedente(api_client, membre_actif):
    url = reverse("accounts:login")
    premiere = api_client.post(
        url,
        {"email": "membre@example.com", "password": "Password123!", "device_id": "fp-a"},
        format="json",
    )
    assert premiere.status_code == 200
    ancien_refresh = premiere.data["refresh"]

    seconde = api_client.post(
        url,
        {"email": "membre@example.com", "password": "Password123!", "device_id": "fp-a"},
        format="json",
    )
    assert seconde.status_code == 200

    refresh_resp = api_client.post(
        reverse("accounts:token-refresh"), {"refresh": ancien_refresh}, format="json"
    )
    assert refresh_resp.status_code == 401

    # La nouvelle session, elle, doit rester utilisable.
    nouveau_refresh = seconde.data["refresh"]
    refresh_resp_nouveau = api_client.post(
        reverse("accounts:token-refresh"), {"refresh": nouveau_refresh}, format="json"
    )
    assert refresh_resp_nouveau.status_code == 200


def test_login_appareil_different_ne_revoque_rien(api_client, membre_actif):
    url = reverse("accounts:login")
    sur_telephone = api_client.post(
        url,
        {
            "email": "membre@example.com",
            "password": "Password123!",
            "device_id": "fp-telephone",
        },
        format="json",
    )
    assert sur_telephone.status_code == 200

    sur_ordinateur = api_client.post(
        url,
        {
            "email": "membre@example.com",
            "password": "Password123!",
            "device_id": "fp-ordinateur",
        },
        format="json",
    )
    assert sur_ordinateur.status_code == 200

    # Les deux appareils restent connectés — un utilisateur multi-appareils n'est pas affecté.
    for resp in (sur_telephone, sur_ordinateur):
        refresh_resp = api_client.post(
            reverse("accounts:token-refresh"), {"refresh": resp.data["refresh"]}, format="json"
        )
        assert refresh_resp.status_code == 200


def test_login_sans_empreinte_ne_revoque_rien(api_client, membre_actif):
    """Un client qui n'envoie pas `device_fingerprint` (rétrocompatibilité) ne doit jamais
    déclencher de révocation — impossible de savoir en toute sécurité qu'il s'agit du même
    appareil, voir services.enforce_single_session_per_device."""
    url = reverse("accounts:login")
    premiere = api_client.post(
        url, {"email": "membre@example.com", "password": "Password123!"}, format="json"
    )
    assert premiere.status_code == 200

    seconde = api_client.post(
        url, {"email": "membre@example.com", "password": "Password123!"}, format="json"
    )
    assert seconde.status_code == 200

    refresh_resp = api_client.post(
        reverse("accounts:token-refresh"), {"refresh": premiere.data["refresh"]}, format="json"
    )
    assert refresh_resp.status_code == 200


def test_login_meme_appareil_journalise_laudit(api_client, membre_actif):
    from apps.accounts.models import AuditLogEntry

    url = reverse("accounts:login")
    api_client.post(
        url,
        {"email": "membre@example.com", "password": "Password123!", "device_id": "fp-a"},
        format="json",
    )
    api_client.post(
        url,
        {"email": "membre@example.com", "password": "Password123!", "device_id": "fp-a"},
        format="json",
    )

    entry = AuditLogEntry.objects.filter(action="device_sessions_revoked").first()
    assert entry is not None
    assert entry.metadata["count"] == 1


def test_verify_2fa_meme_appareil_revoque_la_session_precedente(api_client):
    """Même comportement après 2FA (Bureau Admin+) — la révocation n'a lieu qu'une fois la
    connexion entièrement vérifiée, jamais dès l'étape 1 (login_ticket)."""
    from apps.accounts import services

    User.objects.create_user(
        email="bureau@example.com",
        password="Password123!",
        role=Role.BUREAU_ADMIN,
        is_active=True,
    )

    def se_connecter():
        login_resp = api_client.post(
            reverse("accounts:login"),
            {
                "email": "bureau@example.com",
                "password": "Password123!",
                "device_id": "fp-a",
            },
            format="json",
        )
        assert login_resp.status_code == 200
        assert login_resp.data["requires_2fa"] is True
        ticket = login_resp.data["login_ticket"]

        user = User.objects.get(email="bureau@example.com")
        code = services.generate_email_otp(user, purpose="login_2fa")
        verify_resp = api_client.post(
            reverse("accounts:2fa-verify"),
            {"login_ticket": ticket, "method": "email_otp", "code": code},
            format="json",
        )
        assert verify_resp.status_code == 200
        return verify_resp.data["refresh"]

    ancien_refresh = se_connecter()
    se_connecter()

    refresh_resp = api_client.post(
        reverse("accounts:token-refresh"), {"refresh": ancien_refresh}, format="json"
    )
    assert refresh_resp.status_code == 401


def test_me_requires_authentication(api_client):
    url = reverse("accounts:me")
    resp = api_client.get(url)
    assert resp.status_code == 401


def test_me_renvoie_le_statut_membre_de_la_fiche_liee(api_client):
    """statut_membre (2026-09-26, plan "Öffentliche mycid.org-Startseite" section A) — utilisé
    par HomeRoute.tsx pour distinguer un membre actif (tableau de bord habituel) d'un membre
    non-actif (traité comme un visiteur, voir docstring UserSerializer.get_statut_membre)."""
    from apps.membres.models import StatutMembre
    from apps.membres.tests.factories import MembreFactory

    user = User.objects.create_user(
        email="sami.bensalah@example.com", password="Password123!", is_active=True
    )
    MembreFactory(user=user, statut=StatutMembre.EN_ATTENTE)

    api_client.force_authenticate(user=user)
    resp = api_client.get(reverse("accounts:me"))
    assert resp.status_code == 200
    assert resp.data["statut_membre"] == StatutMembre.EN_ATTENTE


def test_me_renvoie_statut_membre_null_sans_fiche_membre_liee(api_client, membre_actif):
    """Un compte sans fiche Membre (superuser, RH créé hors auto-inscription) ne doit pas faire
    planter la sérialisation — même principe que get_prenom/get_nom (AHM-52)."""
    api_client.force_authenticate(user=membre_actif)
    resp = api_client.get(reverse("accounts:me"))
    assert resp.status_code == 200
    assert resp.data["statut_membre"] is None


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


def test_register_attribue_automatiquement_le_role_rbac_membre(api_client):
    """apps.rbac Phase A : "Ein neuer Benutzer erhält nach Genehmigung automatisch die Rolle
    'Normales Mitglieder'" — la ligne UserRoleAssignment est créée dès l'inscription (avant même
    la validation admin), en plus du CharField legacy `user.role` déjà à "membre" par défaut."""
    from apps.rbac.models import RoleDefinition, UserRoleAssignment

    url = reverse("accounts:register")
    resp = api_client.post(url, payload_inscription(), format="json")
    assert resp.status_code == 201

    user = User.objects.get(email="nouveau@example.com")
    role_membre = RoleDefinition.objects.get(slug="membre", is_system=True)
    assert UserRoleAssignment.objects.filter(user=user, role=role_membre).exists()


def test_register_sans_cin_ni_passeport_reussit(api_client):
    """Depuis le 2026-10-06 (point 1.1) : CIN/passeport facultatifs à l'inscription, exigés
    seulement à l'adhésion (voir apps.adhesions.views._exiger_piece_identite)."""
    url = reverse("accounts:register")
    payload = payload_inscription()
    del payload["cin"]
    resp = api_client.post(url, payload, format="json")
    assert resp.status_code == 201, resp.data


def test_registrations_historique_filtre_et_date_de_decision(api_client, rh_user):
    """Point 5 (2026-10-06) : la liste couvre tout l'historique, filtrable par décision."""
    from django.utils import timezone

    from apps.accounts.models import RegistrationDecision

    User.objects.create_user(
        email="ok@example.de",
        password="Password123!",
        is_active=True,
        email_verifie=True,
        registration_decision=RegistrationDecision.APPROUVE,
        registration_decided_at=timezone.now(),
    )
    User.objects.create_user(
        email="refus@example.de",
        password="Password123!",
        email_verifie=True,
        registration_decision=RegistrationDecision.REFUSE,
    )
    api_client.force_authenticate(rh_user)
    url = reverse("accounts:pending-registrations")
    emails = {u["email"] for u in api_client.get(url).data["results"]}
    assert {"ok@example.de", "refus@example.de"} <= emails
    resp = api_client.get(url, {"decision": "approuve", "tri": "-date"})
    assert [u["email"] for u in resp.data["results"] if u["email"].endswith("example.de")] == [
        "ok@example.de"
    ]
    assert resp.data["results"][0]["registration_decided_at"] is not None


def test_register_avec_uniquement_passeport_reussit(api_client):
    """Symétrique du test précédent : le CIN seul n'est plus requis dès lors que le passeport est
    fourni — voir docstring RegisterSerializer.cin."""
    from apps.membres.models import Membre

    url = reverse("accounts:register")
    payload = payload_inscription()
    del payload["cin"]
    payload["passeport"] = "P1234567"
    resp = api_client.post(url, payload, format="json")
    assert resp.status_code == 201

    membre = Membre.objects.get(user__email="nouveau@example.com")
    assert not membre.cin
    assert membre.passeport == "P1234567"


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
    # Point 2 (2026-10-05) : plus de validation RH — connexion possible immédiatement, mais
    # la fiche Membre reste EN_ATTENTE (non-membre) jusqu'à l'adhésion payée.
    assert user.is_active is True
    assert user.registration_decision == "approuve"
    assert user.membre.statut == "en_attente"


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


# --- Gestion des rôles (SCD §4.2/§8.1) : promotion d'un compte, ex. Abir en Bureau Admin ---


@pytest.fixture
def super_admin_user():
    return User.objects.create_user(
        email="admin@clubistes.de",
        password="Password123!",
        role=Role.SUPER_ADMIN,
        is_active=True,
    )


@pytest.fixture
def membre_cible():
    return User.objects.create_user(
        email="abir@example.com",
        password="Password123!",
        role=Role.MEMBRE,
        is_active=True,
    )


def test_users_list_refuse_sans_authentification(api_client):
    resp = api_client.get(reverse("accounts:users-list"))
    assert resp.status_code == 401


def test_users_list_refuse_a_non_super_admin(api_client, rh_user, membre_cible):
    api_client.force_authenticate(user=rh_user)
    resp = api_client.get(reverse("accounts:users-list"))
    assert resp.status_code == 403


def test_users_list_recherche_par_email(api_client, super_admin_user, membre_cible):
    api_client.force_authenticate(user=super_admin_user)
    resp = api_client.get(reverse("accounts:users-list"), {"q": "abir"})
    assert resp.status_code == 200
    emails = [row["email"] for row in resp.data["results"]]
    assert "abir@example.com" in emails


def test_changer_role_promeut_bureau_admin(api_client, super_admin_user, membre_cible):
    from apps.accounts.models import AuditLogEntry

    api_client.force_authenticate(user=super_admin_user)
    url = reverse("accounts:user-change-role", args=[membre_cible.id])
    resp = api_client.post(url, {"role": "bureau_admin"}, format="json")
    assert resp.status_code == 200
    assert resp.data["role"] == "bureau_admin"

    membre_cible.refresh_from_db()
    assert membre_cible.role == Role.BUREAU_ADMIN

    entry = AuditLogEntry.objects.filter(action="role_changed", user=membre_cible).first()
    assert entry is not None
    assert entry.metadata["ancien_role"] == Role.MEMBRE
    assert entry.metadata["nouveau_role"] == "bureau_admin"
    assert entry.metadata["decided_by"] == str(super_admin_user.id)

    # Le prochain login de ce compte doit désormais exiger le 2FA (niveau >= 3, SCD §3.2).
    login_resp = api_client.post(
        reverse("accounts:login"),
        {"email": "abir@example.com", "password": "Password123!"},
        format="json",
    )
    assert login_resp.status_code == 200
    assert login_resp.data["requires_2fa"] is True


def test_changer_role_refuse_a_non_super_admin(api_client, rh_user, membre_cible):
    api_client.force_authenticate(user=rh_user)
    url = reverse("accounts:user-change-role", args=[membre_cible.id])
    resp = api_client.post(url, {"role": "bureau_admin"}, format="json")
    assert resp.status_code == 403

    membre_cible.refresh_from_db()
    assert membre_cible.role == Role.MEMBRE


def test_changer_role_valeur_invalide_echoue(api_client, super_admin_user, membre_cible):
    api_client.force_authenticate(user=super_admin_user)
    url = reverse("accounts:user-change-role", args=[membre_cible.id])
    resp = api_client.post(url, {"role": "super_hacker"}, format="json")
    assert resp.status_code == 400

    membre_cible.refresh_from_db()
    assert membre_cible.role == Role.MEMBRE


def test_changer_role_soi_meme_echoue(api_client, super_admin_user):
    api_client.force_authenticate(user=super_admin_user)
    url = reverse("accounts:user-change-role", args=[super_admin_user.id])
    resp = api_client.post(url, {"role": "dir_financier"}, format="json")
    assert resp.status_code == 400

    super_admin_user.refresh_from_db()
    assert super_admin_user.role == Role.SUPER_ADMIN


def test_changer_role_utilisateur_introuvable_echoue(api_client, super_admin_user):
    import uuid

    api_client.force_authenticate(user=super_admin_user)
    url = reverse("accounts:user-change-role", args=[uuid.uuid4()])
    resp = api_client.post(url, {"role": "rh"}, format="json")
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Registrierungen" (page_inscriptions)
# désormais pilotée par apps.rbac via HasInscriptionsAdminAccess (real enforcement, y compris
# pour les rôles système eux-mêmes) — remplace IsRHOrAbove UNIQUEMENT sur les 3 vues de
# validation d'inscription ; IsRHOrAbove lui-même reste inchangé pour membres import/export.
# ---------------------------------------------------------------------------


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_rh_perd_lacces_aux_inscriptions_si_matrice_le_dit(
    api_client, rh_user, inscription_en_attente
):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("rh", "page_inscriptions", NiveauAcces.AUCUN)
    api_client.force_authenticate(user=rh_user)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_valider_les_inscriptions_via_la_matrice(
    api_client, inscription_en_attente
):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user = User.objects.create_user(
        email="phased-inscriptions-grant@example.com", password="Password123!", is_active=True
    )
    role_perso = RoleDefinitionFactory(slug="inscriptions-manager")
    RoleModulePermissionFactory(
        role=role_perso, module="page_inscriptions", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)

    api_client.force_authenticate(user=user)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    assert resp.status_code == 200


def test_phase_d_super_admin_gere_toujours_les_inscriptions_meme_si_matrice_dit_aucun(
    api_client, super_admin_user, inscription_en_attente
):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_inscriptions", NiveauAcces.AUCUN)
    api_client.force_authenticate(user=super_admin_user)
    resp = api_client.get(reverse("accounts:pending-registrations"))
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Lecture vs écriture (ajouté le 2026-09-24, task #214, retour utilisateur sur Quiz-Verwaltung —
# voir apps.rbac.services.has_admin_page_access) : PendingRegistrationsView (`lecture` suffit,
# HasInscriptionsAdminAccess) reste inchangée ; Approve/RefuseRegistrationView requièrent
# désormais `lecture_ecriture` (HasInscriptionsAdminWriteAccess). Le test 0002_seed_roles_et_
# matrice/0003_seed_pages_admin_matrice ne seede jamais une cellule `lecture` seule (uniquement
# aucun/lecture_ecriture) — on la force explicitement ici via _set_matrice_cellule pour couvrir
# ce cas.
# ---------------------------------------------------------------------------


def _creer_inscription_en_attente(email):
    from apps.membres.models import Membre, StatutMembre

    user = User.objects.create_user(email=email, password="Password123!", email_verifie=True)
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


def test_rh_avec_lecture_seule_peut_lister_mais_pas_approuver_ni_refuser(
    api_client, rh_user, inscription_en_attente
):
    """Requête explicite (voir plan) : le rôle système RH, avec seulement `lecture` sur
    page_inscriptions, garde l'accès à PendingRegistrationsView (vue inchangée) mais perd
    Approve/RefuseRegistrationView (désormais `lecture_ecriture`)."""
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("rh", "page_inscriptions", NiveauAcces.LECTURE)
    api_client.force_authenticate(user=rh_user)

    resp_list = api_client.get(reverse("accounts:pending-registrations"))
    assert resp_list.status_code == 200
    emails = [row["email"] for row in resp_list.data["results"]]
    assert inscription_en_attente.email in emails

    url_approve = reverse("accounts:pending-registration-approve", args=[inscription_en_attente.id])
    resp_approve = api_client.post(url_approve)
    assert resp_approve.status_code == 403

    url_refuse = reverse("accounts:pending-registration-refuse", args=[inscription_en_attente.id])
    resp_refuse = api_client.post(url_refuse)
    assert resp_refuse.status_code == 403

    inscription_en_attente.refresh_from_db()
    assert inscription_en_attente.registration_decision == RegistrationDecision.EN_ATTENTE


def test_role_personnalise_lecture_seule_peut_lister_mais_pas_approuver(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    inscription = _creer_inscription_en_attente("readonly-target@example.com")
    user = User.objects.create_user(
        email="readonly-inscriptions@example.com", password="Password123!", is_active=True
    )
    role_perso = RoleDefinitionFactory(slug="inscriptions-lecteur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_inscriptions", niveau_acces=NiveauAcces.LECTURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    api_client.force_authenticate(user=user)

    resp_list = api_client.get(reverse("accounts:pending-registrations"))
    assert resp_list.status_code == 200

    url_approve = reverse("accounts:pending-registration-approve", args=[inscription.id])
    resp_approve = api_client.post(url_approve)
    assert resp_approve.status_code == 403


def test_role_personnalise_lecture_ecriture_peut_approuver_et_refuser(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    inscription_a_approuver = _creer_inscription_en_attente("readwrite-approve@example.com")
    inscription_a_refuser = _creer_inscription_en_attente("readwrite-refuse@example.com")
    user = User.objects.create_user(
        email="readwrite-inscriptions@example.com", password="Password123!", is_active=True
    )
    role_perso = RoleDefinitionFactory(slug="inscriptions-editeur")
    RoleModulePermissionFactory(
        role=role_perso, module="page_inscriptions", niveau_acces=NiveauAcces.LECTURE_ECRITURE
    )
    UserRoleAssignmentFactory(user=user, role=role_perso)
    api_client.force_authenticate(user=user)

    resp_approve = api_client.post(
        reverse("accounts:pending-registration-approve", args=[inscription_a_approuver.id])
    )
    assert resp_approve.status_code == 200, resp_approve.data
    inscription_a_approuver.refresh_from_db()
    assert inscription_a_approuver.registration_decision == RegistrationDecision.APPROUVE

    resp_refuse = api_client.post(
        reverse("accounts:pending-registration-refuse", args=[inscription_a_refuser.id])
    )
    assert resp_refuse.status_code == 200, resp_refuse.data
    inscription_a_refuser.refresh_from_db()
    assert inscription_a_refuser.registration_decision == RegistrationDecision.REFUSE

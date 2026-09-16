"""
Tests API — app cotisations (TDD §2.4, SCD §2.3 A01 : IDOR sur les endpoints financiers).
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.cotisations.models import StatutCotisation, TypeArticle
from apps.cotisations.tests.factories import CotisationFactory
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


def _user_avec_membre(role, email):
    user = User.objects.create_user(email=email, password="Password123!", role=role, is_active=True)
    membre = MembreFactory(user=user)
    return user, membre


def _auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


LIST_URL = "cotisations:cotisation-list"


def _detail_url(cotisation):
    return reverse("cotisations:cotisation-detail", args=[cotisation.id])


# --- Authentification ---


def test_list_non_authentifie_refuse(api_client):
    resp = api_client.get(reverse(LIST_URL))
    assert resp.status_code == 401


# --- Libre-service (F-004 stepper) ---


def test_membre_peut_payer_sa_propre_cotisation(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {"type_article": TypeArticle.COTISATION, "mode_paiement": "carte", "statut": "payee"},
    )

    assert resp.status_code == 201, resp.data
    assert str(resp.data["membre"]) == str(membre.id)
    assert resp.data["saisie_par"] is None
    assert str(resp.data["montant"]) == "45.00"  # tarif catalogue, pas de montant du client
    assert resp.data["libelle"] == f"Cotisation annuelle {resp.data['annee']}"
    # AHM-53 : jamais fait confiance au statut envoyé par le client en libre-service — reste
    # en_attente tant que le Directeur Financier/Admin ne l'a pas confirmé (marquer_payee).
    assert resp.data["statut"] == StatutCotisation.EN_ATTENTE
    assert resp.data["reference_transaction"] is None
    assert resp.data["date_paiement"] is None


def test_paiement_libre_service_en_attente_notifie_le_directeur_financier(api_client):
    """Ajouté le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — voir
    notifications.notifier_nouveau_paiement_attente_staff : tout Directeur Financier+ est
    notifié dès qu'un paiement libre-service reste en_attente de confirmation manuelle
    (AHM-53), jamais RH/Bureau Admin (niveau insuffisant)."""
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    df = User.objects.create_user(
        email="df@example.de", password="Password123!", role=Role.DIR_FINANCIER, is_active=True
    )
    rh = User.objects.create_user(
        email="rh@example.de", password="Password123!", role=Role.RH, is_active=True
    )
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {"type_article": TypeArticle.COTISATION, "mode_paiement": "carte", "statut": "payee"},
    )

    assert resp.status_code == 201, resp.data
    notification = Notification.objects.get(destinataire=df)
    assert notification.type_notification == TypeNotification.COTISATION_PAIEMENT_ATTENTE
    assert notification.lien == "/cotisations/en-attente"
    assert not Notification.objects.filter(destinataire=rh).exists()


def test_df_qui_saisit_pour_autrui_nest_pas_soi_meme_notifie(api_client):
    """La branche "saisie DF pour un autre membre" n'utilise pas le statut en_attente
    libre-service — pas de notification staff à générer ici (voir views.perform_create)."""
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "df@example.de")
    _autre_user, autre_membre = _user_avec_membre(Role.MEMBRE, "autre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.COTISATION,
            "mode_paiement": "carte",
            "statut": "payee",
            "membre": str(autre_membre.id),
        },
    )

    assert resp.status_code == 201, resp.data
    assert not Notification.objects.filter(
        type_notification=TypeNotification.COTISATION_PAIEMENT_ATTENTE
    ).exists()


def test_statut_libre_service_toujours_en_attente_quel_que_soit_le_mode_de_paiement(api_client):
    # AHM-53 : "je reçois une quittance immédiate pour un virement SEPA" — plus vrai pour aucun
    # mode de paiement en libre-service, aucune passerelle réelle ne pouvant le vérifier.
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    for mode in ("carte", "virement_sepa", "paypal"):
        resp = api_client.post(
            reverse(LIST_URL),
            {
                "type_article": TypeArticle.ADHESION,
                "mode_paiement": mode,
                "statut": "payee",  # ignoré côté serveur
            },
        )
        assert resp.status_code == 201, resp.data
        assert resp.data["statut"] == StatutCotisation.EN_ATTENTE, mode
        assert resp.data["mode_paiement"] == mode
        assert resp.data["reference_transaction"] is None


def test_montant_catalogue_impose_meme_si_client_en_envoie_un_autre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.COTISATION,
            "montant": "1.00",  # doit être ignoré — tarif catalogue imposé côté serveur
            "mode_paiement": "carte",
            "statut": "payee",
        },
    )

    assert resp.status_code == 201, resp.data
    assert str(resp.data["montant"]) == "45.00"


def test_don_libre_conserve_le_montant_transmis(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "donateur@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.DON,
            "libelle": "Don libre — soutien projet",
            "montant": "20.00",
            "mode_paiement": "paypal",
            "statut": "payee",
        },
    )

    assert resp.status_code == 201, resp.data
    assert str(resp.data["montant"]) == "20.00"


def test_don_sans_libelle_refuse(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "donateur@example.de")
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"type_article": TypeArticle.DON, "montant": "20.00"})

    assert resp.status_code == 400
    assert "libelle" in resp.data["details"]


def test_evenement_sans_montant_refuse(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {"type_article": TypeArticle.EVENEMENT, "libelle": "Sortie Dortmund"},
    )

    assert resp.status_code == 400
    assert "montant" in resp.data["details"]


def test_creation_sans_fiche_membre_liee_refusee(api_client):
    user = User.objects.create_user(
        email="sans-fiche@example.de", password="Password123!", role=Role.MEMBRE, is_active=True
    )
    _auth(api_client, user)

    resp = api_client.post(reverse(LIST_URL), {"type_article": TypeArticle.COTISATION})
    assert resp.status_code == 400


# --- Saisie pour autrui (F-015) ---


def test_membre_ne_peut_pas_saisir_pour_un_autre_membre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "membre@example.de")
    autre = MembreFactory()
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL), {"type_article": TypeArticle.COTISATION, "membre": str(autre.id)}
    )
    assert resp.status_code == 403


def test_directeur_financier_peut_saisir_pour_un_autre_membre(api_client):
    user, _membre_dg = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    autre = MembreFactory()
    _auth(api_client, user)

    resp = api_client.post(
        reverse(LIST_URL),
        {
            "type_article": TypeArticle.ADHESION,
            "mode_paiement": "virement_sepa",
            "statut": "payee",
            "membre": str(autre.id),
        },
    )

    assert resp.status_code == 201, resp.data
    assert str(resp.data["membre"]) == str(autre.id)
    assert str(resp.data["saisie_par"]) == str(_membre_dg.id)


# --- Scope liste / IDOR (SCD §2.3 A01) ---


def test_membre_ne_voit_que_ses_propres_cotisations(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    CotisationFactory(membre=membre)
    CotisationFactory()  # une autre fiche, non liée à ce compte

    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre.id)


def test_membre_peut_recuperer_sa_propre_cotisation(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(membre=membre)

    _auth(api_client, user)
    resp = api_client.get(_detail_url(cotisation))

    assert resp.status_code == 200
    assert str(resp.data["id"]) == str(cotisation.id)


def test_membre_ne_peut_pas_recuperer_la_cotisation_dun_autre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation_autrui = CotisationFactory()

    _auth(api_client, user)
    resp = api_client.get(_detail_url(cotisation_autrui))

    assert resp.status_code == 404


def test_rh_peut_recuperer_le_detail_dune_cotisation_dautrui(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    cotisation = CotisationFactory()

    _auth(api_client, user)
    resp = api_client.get(_detail_url(cotisation))

    assert resp.status_code == 200
    assert str(resp.data["id"]) == str(cotisation.id)


def test_rh_liste_toutes_les_cotisations(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    CotisationFactory.create_batch(3)

    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL))

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 3


# --- Registre append-only ---


def test_update_non_autorise(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(membre=membre)

    _auth(api_client, user)
    resp = api_client.patch(_detail_url(cotisation), {"statut": StatutCotisation.ANNULEE})

    assert resp.status_code == 405


def test_delete_non_autorise(api_client):
    user, membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(membre=membre)

    _auth(api_client, user)
    resp = api_client.delete(_detail_url(cotisation))

    assert resp.status_code == 405


# --- Filtres ---


def test_filtre_par_statut(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    CotisationFactory(statut=StatutCotisation.PAYEE)
    CotisationFactory(statut=StatutCotisation.EN_ATTENTE, reference_transaction=None)

    _auth(api_client, user)
    resp = api_client.get(reverse(LIST_URL), {"statut": StatutCotisation.EN_ATTENTE})

    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert resp.data["results"][0]["statut"] == StatutCotisation.EN_ATTENTE


# --- Reçu PDF (AHM-17, RICEFW R-010) ---


def _receipt_url(cotisation):
    return reverse("cotisations:cotisation-receipt", args=[cotisation.id])


def test_receipt_non_authentifie_refuse(api_client):
    cotisation = CotisationFactory()
    resp = api_client.get(_receipt_url(cotisation))
    assert resp.status_code == 401


def test_receipt_disponible_pour_le_proprietaire(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(membre=membre, statut=StatutCotisation.PAYEE)

    _auth(api_client, user)
    resp = api_client.get(_receipt_url(cotisation))

    assert resp.status_code == 200
    assert resp["Content-Type"] == "application/pdf"
    assert resp["Content-Disposition"] == (
        f'attachment; filename="recu-{cotisation.reference_transaction}.pdf"'
    )
    assert resp.content.startswith(b"%PDF-")


def test_receipt_refuse_pour_la_cotisation_dun_autre_membre(api_client):
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation_autrui = CotisationFactory(statut=StatutCotisation.PAYEE)

    _auth(api_client, user)
    resp = api_client.get(_receipt_url(cotisation_autrui))

    assert resp.status_code == 404  # IDOR : ne révèle même pas l'existence de la ressource


def test_rh_peut_telecharger_le_recu_dun_autre_membre(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    cotisation = CotisationFactory(statut=StatutCotisation.PAYEE)

    _auth(api_client, user)
    resp = api_client.get(_receipt_url(cotisation))

    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF-")


def test_receipt_refuse_si_cotisation_pas_encore_payee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.get(_receipt_url(cotisation))

    assert resp.status_code == 400


# --- Confirmation manuelle de paiement (AHM-53) ---


def _marquer_payee_url(cotisation):
    return reverse("cotisations:cotisation-marquer-payee", args=[cotisation.id])


def test_marquer_payee_non_authentifie_refuse(api_client):
    cotisation = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, reference_transaction=None)
    resp = api_client.post(_marquer_payee_url(cotisation))
    assert resp.status_code == 401


def test_directeur_financier_peut_marquer_payee(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE, mode_paiement="", reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "virement_sepa"})

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutCotisation.PAYEE
    assert resp.data["mode_paiement"] == "virement_sepa"
    assert resp.data["reference_transaction"].startswith("TXN-")
    assert resp.data["date_paiement"] is not None


def test_marquer_payee_cree_une_notification_in_app_pour_le_membre(api_client):
    from apps.notifications.models import Notification, TypeNotification

    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg2@example.de")
    user_paye = User.objects.create_user(
        email="paye@example.de", password="Password123!", is_active=True
    )
    membre_paye = MembreFactory(user=user_paye)
    cotisation = CotisationFactory(
        membre=membre_paye,
        statut=StatutCotisation.EN_ATTENTE,
        mode_paiement="",
        reference_transaction=None,
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "virement_sepa"})
    assert resp.status_code == 200, resp.data

    notification = Notification.objects.get(destinataire=user_paye)
    assert notification.type_notification == TypeNotification.PAIEMENT_CONFIRME


def test_admin_peut_marquer_payee(api_client):
    user, _membre = _user_avec_membre(Role.SUPER_ADMIN, "admin@example.de")
    cotisation = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE, mode_paiement="", reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "virement_sepa"})

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutCotisation.PAYEE


def test_marquer_payee_conserve_le_mode_de_paiement_existant_si_non_precise(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE,
        mode_paiement="virement_sepa",
        reference_transaction=None,
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation))

    assert resp.status_code == 200, resp.data
    assert resp.data["mode_paiement"] == "virement_sepa"


def test_marquer_payee_refuse_si_mode_de_paiement_absent(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE, mode_paiement="", reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation))

    assert resp.status_code == 400
    assert "mode_paiement" in resp.data["details"]


def test_rh_ne_peut_pas_marquer_payee(api_client):
    user, _membre = _user_avec_membre(Role.RH, "rh@example.de")
    cotisation = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, reference_transaction=None)

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "virement_sepa"})

    assert resp.status_code == 403


def test_membre_ne_peut_pas_marquer_sa_propre_cotisation_payee(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation = CotisationFactory(
        membre=membre, statut=StatutCotisation.EN_ATTENTE, reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "virement_sepa"})

    assert resp.status_code == 403


def test_marquer_payee_refuse_pour_la_cotisation_dun_autre_membre_hors_scope(api_client):
    # IDOR : un Membre normal (rôle < RH) ne peut même pas voir la ressource d'un autre membre —
    # get_object() renvoie 404 avant que la vérification de rôle DF/Admin ne soit atteinte.
    user, _membre = _user_avec_membre(Role.MEMBRE, "a@example.de")
    cotisation_autrui = CotisationFactory(
        statut=StatutCotisation.EN_ATTENTE, reference_transaction=None
    )

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation_autrui), {"mode_paiement": "carte"})

    assert resp.status_code == 404


def test_marquer_payee_refuse_si_deja_payee(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(statut=StatutCotisation.PAYEE)

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "carte"})

    assert resp.status_code == 400


def test_marquer_payee_refuse_si_annulee(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(statut=StatutCotisation.ANNULEE, reference_transaction=None)

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "carte"})

    assert resp.status_code == 400


def test_marquer_payee_refuse_mode_de_paiement_invalide(api_client):
    user, _membre = _user_avec_membre(Role.DIR_FINANCIER, "dg@example.de")
    cotisation = CotisationFactory(statut=StatutCotisation.EN_ATTENTE, reference_transaction=None)

    _auth(api_client, user)
    resp = api_client.post(_marquer_payee_url(cotisation), {"mode_paiement": "bitcoin"})

    assert resp.status_code == 400

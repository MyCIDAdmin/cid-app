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


def _annuler_evenement_url(evenement):
    return reverse("evenements:evenement-annuler", args=[evenement.id])


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


def test_annuler_evenement_publie_declenche_la_notification(api_client, monkeypatch):
    """Ajouté le 2026-09-16 — vérifie uniquement le câblage (annuler() -> .delay()), la
    logique de la tâche elle-même est testée dans test_tasks.py."""
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "bureau-annule@example.de")
    evenement = EvenementFactory(statut=StatutEvenement.PUBLIE)

    appels = []
    monkeypatch.setattr(
        "apps.evenements.views.envoyer_annulation_evenement.delay",
        lambda evenement_id: appels.append(evenement_id),
    )

    resp = _auth(api_client, user).post(_annuler_evenement_url(evenement))

    assert resp.status_code == 200
    assert resp.data["statut"] == StatutEvenement.ANNULE
    assert appels == [str(evenement.id)]


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


# --- Synchronisation Cotisation liée (ajoutée le 2026-09-20, retour utilisateur : "Wenn ich auf
# 'Confirmer et payer' clicke, ich soll direkt zur Zahlung springen") — voir apps.evenements.
# services.synchroniser_cotisation, appelée depuis inscrire()/InscriptionViewSet.annuler().


def test_inscrire_en_attente_paiement_cree_une_cotisation_liee(api_client):
    from apps.cotisations.models import StatutCotisation, TypeArticle

    user, membre = _user_avec_membre(Role.MEMBRE, "cot1@example.de")
    evenement = EvenementFactory(cout=Decimal("35.00"), places_max=10)

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 2}
    )

    assert resp.status_code == 200, resp.data
    from apps.evenements.models import Inscription

    inscription = Inscription.objects.get(id=resp.data["id"])
    assert inscription.cotisation is not None
    assert inscription.cotisation.membre_id == membre.id
    assert inscription.cotisation.type_article == TypeArticle.EVENEMENT
    assert inscription.cotisation.statut == StatutCotisation.EN_ATTENTE
    assert str(inscription.cotisation.montant) == "70.00"


def test_inscrire_gratuit_ne_cree_pas_de_cotisation(api_client):
    user, _ = _user_avec_membre(Role.MEMBRE, "cot2@example.de")
    evenement = EvenementFactory(gratuit=True, cout=Decimal("0.00"), places_max=10)

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["cotisation"] is None


def test_reinscrire_avant_paiement_met_a_jour_la_meme_cotisation_pas_une_nouvelle(api_client):
    user, membre = _user_avec_membre(Role.MEMBRE, "cot3@example.de")
    evenement = EvenementFactory(cout=Decimal("35.00"), places_max=10)

    resp1 = _auth(api_client, user).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 1}
    )
    resp2 = _auth(api_client, user).post(
        reverse(INSCRIRE_URL), {"evenement": str(evenement.id), "places": 3}
    )

    assert resp1.status_code == 200, resp1.data
    assert resp2.status_code == 200, resp2.data
    assert resp1.data["cotisation"] == resp2.data["cotisation"]  # même écriture mise à jour

    from apps.cotisations.models import Cotisation

    assert Cotisation.objects.filter(membre=membre, type_article="evenement").count() == 1
    cotisation = Cotisation.objects.get(membre=membre, type_article="evenement")
    assert str(cotisation.montant) == "105.00"


def test_annuler_annule_la_cotisation_liee_non_payee(api_client):
    from apps.cotisations.models import StatutCotisation
    from apps.cotisations.tests.factories import CotisationFactory

    user, membre = _user_avec_membre(Role.MEMBRE, "cot4@example.de")
    cotisation = CotisationFactory(membre=membre, statut=StatutCotisation.EN_ATTENTE)
    inscription = InscriptionFactory(
        membre=membre, cotisation=cotisation, statut=StatutInscription.EN_ATTENTE_PAIEMENT
    )

    resp = _auth(api_client, user).post(_inscription_annuler_url(inscription))

    assert resp.status_code == 200, resp.data
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.ANNULEE


def test_annuler_ne_touche_pas_une_cotisation_deja_payee(api_client):
    from apps.cotisations.models import StatutCotisation
    from apps.cotisations.tests.factories import CotisationFactory

    user, membre = _user_avec_membre(Role.MEMBRE, "cot5@example.de")
    cotisation = CotisationFactory(membre=membre, statut=StatutCotisation.PAYEE)
    inscription = InscriptionFactory(
        membre=membre, cotisation=cotisation, statut=StatutInscription.CONFIRMEE
    )

    resp = _auth(api_client, user).post(_inscription_annuler_url(inscription))

    assert resp.status_code == 200, resp.data
    cotisation.refresh_from_db()
    assert cotisation.statut == StatutCotisation.PAYEE


def test_membre_ne_voit_que_ses_propres_inscriptions(api_client):
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m9@example.de")
    user2, membre2 = _user_avec_membre(Role.MEMBRE, "m10@example.de")
    InscriptionFactory(membre=membre1)
    InscriptionFactory(membre=membre2)

    resp = _auth(api_client, user1).get(reverse(INSCRIPTION_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 1
    assert str(resp.data["results"][0]["membre"]) == str(membre1.id)


def test_role_personnalise_eleve_voit_toutes_les_inscriptions(api_client):
    """apps.rbac Phase B : un rôle personnalisé avec au moins la lecture sur "evenements" voit
    TOUTES les inscriptions, comme Bureau Admin+ — voir is_elevated_for_module."""
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import (
        RoleDefinitionFactory,
        RoleModulePermissionFactory,
        UserRoleAssignmentFactory,
    )

    user, membre = _user_avec_membre(Role.MEMBRE, "vertrieb-idor@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m-idor-autre@example.de")
    role = RoleDefinitionFactory(slug="vertrieb-evenements-idor")
    RoleModulePermissionFactory(role=role, module="evenements", niveau_acces=NiveauAcces.LECTURE)
    UserRoleAssignmentFactory(user=user, role=role)
    InscriptionFactory(membre=membre)
    InscriptionFactory(membre=membre2)

    resp = _auth(api_client, user).get(reverse(INSCRIPTION_LIST_URL))
    assert resp.status_code == 200
    assert len(resp.data["results"]) == 2


def test_membre_sans_role_eleve_ne_voit_toujours_que_ses_propres_inscriptions(api_client):
    """Régression explicite après le câblage Phase B : sans UserRoleAssignment
    supplémentaire, le comportement historique (SCD §2.3 A01) n'a pas bougé."""
    user1, membre1 = _user_avec_membre(Role.MEMBRE, "m-idor-regression1@example.de")
    _, membre2 = _user_avec_membre(Role.MEMBRE, "m-idor-regression2@example.de")
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


# --- Inscription payée en espèces par le Directeur Financier/Admin (ajoutée le 2026-09-21,
# retour utilisateur : "Event als Artikeltyp hinzufügen. Beim Anklicken sollen aktive Events
# angezeigt [werden]", dans le formulaire "Barzahlung eintragen" de CotisationsEnAttentePage) —
# voir EvenementViewSet.inscrire_especes.

INSCRIRE_ESPECES_URL = "evenements:evenement-inscrire-especes"


def test_df_inscrit_un_autre_membre_et_confirme_le_paiement_en_especes(api_client):
    from apps.cotisations.models import Cotisation, ModePaiement, StatutCotisation, TypeArticle
    from apps.evenements.models import Inscription

    user, _df = _user_avec_membre(Role.DIR_FINANCIER, "df1@example.de")
    membre_cible = MembreFactory()
    evenement = EvenementFactory(cout=Decimal("25.00"), places_max=10)

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_ESPECES_URL),
        {"evenement": str(evenement.id), "membre": str(membre_cible.id), "places": 2},
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutInscription.CONFIRMEE

    inscription = Inscription.objects.get(id=resp.data["id"])
    assert inscription.membre_id == membre_cible.id
    assert inscription.statut == StatutInscription.CONFIRMEE

    cotisation = Cotisation.objects.get(id=inscription.cotisation_id)
    assert cotisation.type_article == TypeArticle.EVENEMENT
    assert cotisation.statut == StatutCotisation.PAYEE
    assert cotisation.mode_paiement == ModePaiement.ESPECES
    assert str(cotisation.montant) == "50.00"
    assert cotisation.reference_transaction is not None
    assert cotisation.date_paiement is not None

    from apps.cotisations.models import HistoriqueStatutCotisation

    historique = HistoriqueStatutCotisation.objects.get(cotisation=cotisation)
    assert historique.ancien_statut == StatutCotisation.EN_ATTENTE
    assert historique.nouveau_statut == StatutCotisation.PAYEE


def test_inscrire_especes_refuse_a_un_role_insuffisant(api_client):
    user, _ = _user_avec_membre(Role.RH, "rh1@example.de")
    membre_cible = MembreFactory()
    evenement = EvenementFactory()

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_ESPECES_URL),
        {"evenement": str(evenement.id), "membre": str(membre_cible.id), "places": 1},
    )

    assert resp.status_code == 403


def test_inscrire_especes_gratuit_confirme_sans_cotisation(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df2@example.de")
    membre_cible = MembreFactory()
    evenement = EvenementFactory(gratuit=True, cout=Decimal("0.00"))

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_ESPECES_URL),
        {"evenement": str(evenement.id), "membre": str(membre_cible.id), "places": 1},
    )

    assert resp.status_code == 200, resp.data
    assert resp.data["statut"] == StatutInscription.CONFIRMEE
    assert resp.data["cotisation"] is None


def test_inscrire_especes_respecte_la_capacite(api_client):
    user, _ = _user_avec_membre(Role.DIR_FINANCIER, "df3@example.de")
    membre_cible = MembreFactory()
    evenement = EvenementFactory(places_max=1)
    InscriptionFactory(evenement=evenement, places=1)

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_ESPECES_URL),
        {"evenement": str(evenement.id), "membre": str(membre_cible.id), "places": 1},
    )

    assert resp.status_code == 400
    assert "places" in resp.data["details"]


def test_admin_peut_inscrire_especes(api_client):
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "admin-inscrire-especes@example.de")
    membre_cible = MembreFactory()
    evenement = EvenementFactory(cout=Decimal("10.00"))

    resp = _auth(api_client, user).post(
        reverse(INSCRIRE_ESPECES_URL),
        {"evenement": str(evenement.id), "membre": str(membre_cible.id), "places": 1},
    )

    assert resp.status_code == 200, resp.data


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


# ---------------------------------------------------------------------------
# Phase D (ajoutée le 2026-09-23) — page de gestion "Veranstaltungsverwaltung" (page_events)
# désormais pilotée par apps.rbac (real enforcement, y compris pour les rôles système eux-mêmes).
# ---------------------------------------------------------------------------

_EVENEMENT_PAYLOAD = {
    "titre": "Déplacement Munich",
    "type_evenement": "deplacement",
    "description": "desc",
    "date_evenement": "2027-01-01",
    "lieu": "Munich",
}


def _set_matrice_cellule(role_slug, module_slug, niveau_acces):
    from apps.rbac.models import NiveauAcces, RoleDefinition, RoleModulePermission

    role = RoleDefinition.objects.get(slug=role_slug, is_system=True)
    RoleModulePermission.objects.update_or_create(
        role=role, module=module_slug, defaults={"niveau_acces": niveau_acces}
    )


def test_phase_d_bureau_admin_perd_lacces_a_la_gestion_des_evenements_si_matrice_le_dit(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("bureau_admin", "page_events", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.BUREAU_ADMIN, "phased-events-restrict@example.de")

    resp = _auth(api_client, user).post(reverse(EVENEMENT_LIST_URL), _EVENEMENT_PAYLOAD)
    assert resp.status_code == 403


def test_phase_d_role_personnalise_peut_gerer_les_evenements_via_la_matrice(api_client):
    from apps.rbac.models import NiveauAcces
    from apps.rbac.tests.factories import RoleDefinitionFactory, RoleModulePermissionFactory, UserRoleAssignmentFactory

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-events-grant@example.de")
    role_perso = RoleDefinitionFactory(slug="events-manager")
    RoleModulePermissionFactory(role=role_perso, module="page_events", niveau_acces=NiveauAcces.LECTURE_ECRITURE)
    UserRoleAssignmentFactory(user=user, role=role_perso)

    resp = _auth(api_client, user).post(reverse(EVENEMENT_LIST_URL), _EVENEMENT_PAYLOAD)
    assert resp.status_code == 201


def test_phase_d_super_admin_gere_toujours_les_evenements_meme_si_matrice_dit_aucun(api_client):
    from apps.rbac.models import NiveauAcces

    _set_matrice_cellule("super_admin", "page_events", NiveauAcces.AUCUN)
    user, _ = _user_avec_membre(Role.SUPER_ADMIN, "phased-events-super@example.de")

    resp = _auth(api_client, user).post(reverse(EVENEMENT_LIST_URL), _EVENEMENT_PAYLOAD)
    assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Phase D — distinction lecture/écriture réelle (2026-09-24) — apps.rbac.services.
# has_admin_page_access(required=...) pour page_events (EvenementPermission.
# EVENEMENT_WRITE_ACTIONS). Les tests Phase D ci-dessus couvrent le retrait/octroi TOTAL
# d'accès (AUCUN vs LECTURE_ECRITURE) ; ceux-ci couvrent spécifiquement LECTURE SEULE — le cas
# exact du bug original (voir apps.communaute.tests.test_api pour le rapport utilisateur
# complet, page_quiz, et apps.rbac.services.has_admin_page_access pour le mécanisme).
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


def test_phase_d_lecture_seule_page_events_permet_de_lister_les_evenements(api_client):
    """Lecture non régressée : un rôle avec seulement `lecture` sur page_events doit toujours
    pouvoir consulter la liste des événements (list/retrieve ne sont d'ailleurs pas gatés par
    page_events dans EvenementPermission — ouverts à tout authentifié — ce test garantit
    qu'assigner un rôle personnalisé lecture seule n'introduit aucune régression de lecture)."""
    from apps.rbac.models import NiveauAcces

    EvenementFactory(statut=StatutEvenement.PUBLIE, titre="Match amical")
    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-events-read@example.de")
    _assigner_role_perso(user, "page_events", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).get(reverse(EVENEMENT_LIST_URL))
    assert resp.status_code == 200


def test_phase_d_lecture_seule_page_events_refuse_creation_dun_evenement(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-events-write@example.de")
    _assigner_role_perso(user, "page_events", NiveauAcces.LECTURE)

    resp = _auth(api_client, user).post(reverse(EVENEMENT_LIST_URL), _EVENEMENT_PAYLOAD)
    assert resp.status_code == 403


def test_phase_d_lecture_ecriture_page_events_permet_de_creer_un_evenement(api_client):
    from apps.rbac.models import NiveauAcces

    user, _ = _user_avec_membre(Role.MEMBRE, "phased-rw-events-write-ok@example.de")
    _assigner_role_perso(user, "page_events", NiveauAcces.LECTURE_ECRITURE)

    resp = _auth(api_client, user).post(reverse(EVENEMENT_LIST_URL), _EVENEMENT_PAYLOAD)
    assert resp.status_code == 201
    assert resp.data["titre"] == _EVENEMENT_PAYLOAD["titre"]

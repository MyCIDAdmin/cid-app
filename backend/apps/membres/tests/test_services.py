"""
Tests — apps.membres.services.enregistrer_statut_annuel (demande utilisateur du 2026-09-19,
historique de statut associatif par année). Les déclencheurs réels (paiement confirmé, échéance
dépassée) sont testés côté apps.cotisations (voir apps.cotisations.tests.test_api /
test_webhooks / test_tasks) — ici on teste directement le service, indépendamment de qui l'appelle.

`mailoutbox` (fixture pytest-django) bascule EMAIL_BACKEND sur locmem : sans lui, `.delay()` sur
les tâches d'email (apps.membres.tasks) tenterait de publier sur le broker Celery réel."""

import pytest

from apps.accounts.models import User
from apps.membres.models import (
    HistoriqueStatutMembre,
    RaisonChangementStatut,
    StatutMembre,
)
from apps.membres.services import enregistrer_statut_annuel
from apps.membres.tests.factories import MembreFactory
from apps.notifications.models import Notification, TypeNotification

pytestmark = pytest.mark.django_db


def _membre_avec_compte(statut=StatutMembre.EN_ATTENTE, email="membre@example.de"):
    user = User.objects.create_user(email=email, password="Password123!", is_active=True)
    return MembreFactory(user=user, statut=statut)


def test_cree_une_entree_dhistorique(mailoutbox):
    membre = _membre_avec_compte()

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    entree = HistoriqueStatutMembre.objects.get(membre=membre, annee=2027)
    assert entree.statut == StatutMembre.ACTIF
    assert entree.raison == RaisonChangementStatut.PAIEMENT_CONFIRME


def test_synchronise_le_statut_courant_quand_cest_lannee_la_plus_recente(mailoutbox):
    membre = _membre_avec_compte(statut=StatutMembre.EN_ATTENTE)

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    membre.refresh_from_db()
    assert membre.statut == StatutMembre.ACTIF


def test_upsert_idempotent_ne_duplique_pas(mailoutbox):
    membre = _membre_avec_compte()

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )
    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    assert HistoriqueStatutMembre.objects.filter(membre=membre, annee=2027).count() == 1


def test_ne_touche_pas_le_statut_courant_pour_une_annee_passee_plus_ancienne(mailoutbox):
    # Régularisation tardive d'un paiement N-1 après que N ait déjà été enregistré : l'historique
    # est mis à jour mais le statut COURANT (celui de l'année la plus récente, 2027) ne doit
    # jamais retomber/revenir en arrière à cause d'un rattrapage sur 2026.
    membre = _membre_avec_compte(statut=StatutMembre.EN_ATTENTE)
    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.INACTIF, RaisonChangementStatut.ECHEANCE_DEPASSEE
    )
    membre.refresh_from_db()
    assert membre.statut == StatutMembre.INACTIF

    enregistrer_statut_annuel(
        membre, 2026, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    membre.refresh_from_db()
    assert membre.statut == StatutMembre.INACTIF  # inchangé
    assert HistoriqueStatutMembre.objects.get(membre=membre, annee=2026).statut == (
        StatutMembre.ACTIF
    )


def test_ne_notifie_pas_si_le_statut_courant_ne_change_pas(mailoutbox):
    membre = _membre_avec_compte(statut=StatutMembre.ACTIF)

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    assert Notification.objects.filter(destinataire=membre.user).count() == 0
    assert len(mailoutbox) == 0


def test_activation_cree_une_notification_in_app(mailoutbox):
    membre = _membre_avec_compte(statut=StatutMembre.INACTIF)

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    notification = Notification.objects.get(destinataire=membre.user)
    assert notification.type_notification == TypeNotification.MEMBRE_STATUT_ACTIF
    assert notification.lien == f"/membres/{membre.id}"


def test_desactivation_cree_une_notification_in_app(mailoutbox):
    membre = _membre_avec_compte(statut=StatutMembre.ACTIF)

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.INACTIF, RaisonChangementStatut.ECHEANCE_DEPASSEE
    )

    notification = Notification.objects.get(destinataire=membre.user)
    assert notification.type_notification == TypeNotification.MEMBRE_STATUT_INACTIF
    assert notification.lien == "/cotisation"


def test_membre_sans_compte_utilisateur_ne_leve_pas(mailoutbox):
    membre = MembreFactory(statut=StatutMembre.EN_ATTENTE)  # pas de user

    enregistrer_statut_annuel(
        membre, 2027, StatutMembre.ACTIF, RaisonChangementStatut.PAIEMENT_CONFIRME
    )

    membre.refresh_from_db()
    assert membre.statut == StatutMembre.ACTIF
    assert Notification.objects.count() == 0
    assert len(mailoutbox) == 0

"""
Services — app membres (ajouté le 2026-09-19).

`enregistrer_statut_annuel` est le SEUL point d'écriture de `HistoriqueStatutMembre` (voir
docstring du modèle, models.py) — appelé exclusivement par `apps.cotisations` :
  - `apps.cotisations.notifications.notifier_paiement_confirme` (paiement de la cotisation
    annuelle confirmé, manuellement ou via webhook PSP) -> statut actif ;
  - `apps.cotisations.tasks` (checkpoint J+1 de la pipeline de relance, échéance dépassée sans
    cotisation payée) -> statut inactif.

Centralise aussi les effets de bord d'un changement RÉEL du statut COURANT (`Membre.statut`) :
notification in-app + email, déclenchés une seule fois, jamais pour un simple ré-enregistrement
de l'historique qui ne change rien au statut courant (idempotence — ex. tâche Celery Beat
rejouée le même jour, ou webhook PSP reçu deux fois)."""

import logging

from django.utils import timezone

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import HistoriqueStatutMembre, Membre, StatutMembre
from .tasks import envoyer_email_statut_actif, envoyer_email_statut_inactif

logger = logging.getLogger(__name__)


def enregistrer_statut_annuel(
    membre: Membre, annee: int, statut: str, raison: str, date_effet=None
) -> None:
    """
    Enregistre/met à jour l'entrée d'historique (membre, annee) — idempotent (upsert), rejouer le
    même (membre, annee, statut) ne crée jamais de doublon.

    Ne synchronise `Membre.statut` que si `annee` est l'année la plus récente déjà enregistrée
    pour ce membre (ou la première entrée) : un rattrapage tardif d'une année PASSÉE (ex.
    régularisation d'un paiement N-1 après coup) alimente l'historique mais ne doit jamais faire
    revivre/retomber le statut courant, qui ne suit que l'année en cours."""
    date_effet = date_effet or timezone.now()
    HistoriqueStatutMembre.objects.update_or_create(
        membre=membre,
        annee=annee,
        defaults={"statut": statut, "raison": raison, "date_effet": date_effet},
    )

    derniere_annee = (
        membre.historique_statuts.order_by("-annee").values_list("annee", flat=True).first()
    )
    if derniere_annee is not None and annee < derniere_annee:
        return

    if membre.statut == statut:
        return
    membre.statut = statut
    membre.save(update_fields=["statut", "updated_at"])

    user = getattr(membre, "user", None)
    if statut == StatutMembre.ACTIF:
        notifier(
            user,
            TypeNotification.MEMBRE_STATUT_ACTIF,
            titre="Statut réactivé",
            message=f"Votre statut de membre est de nouveau actif pour {annee}.",
            lien="/profil",
        )
        envoyer_email_statut_actif.delay(str(membre.id), annee)
    elif statut == StatutMembre.INACTIF:
        notifier(
            user,
            TypeNotification.MEMBRE_STATUT_INACTIF,
            titre="Statut désactivé",
            message=f"Votre statut de membre est passé à inactif — cotisation {annee} non réglée.",
            lien="/cotisations",
        )
        envoyer_email_statut_inactif.delay(str(membre.id), annee)

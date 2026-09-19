"""
Point d'intégration `apps.notifications` pour ce module (Phase 2B) — voir
apps.notifications.services.notifier pour la convention générale.

Regroupé ici plutôt que dupliqué dans views.py/webhooks.py/tasks.py : ce sont les 3 points d'entrée
qui font passer une Cotisation à `payee` (marquer_payee, le webhook Stripe/PayPal, et — pour la
relance — aucune transition de statut mais un rappel périodique), et tous les 3 doivent déclencher
la même notification "paiement confirmé"/"relance cotisation" (RICEFW W-001/W-002).

Depuis le 2026-09-19 (demande utilisateur), `notifier_paiement_confirme` déclenche aussi la mise à
jour du statut associatif annuel du membre (voir apps.membres.services.enregistrer_statut_annuel)
quand le paiement concerne la cotisation annuelle (type_article=cotisation, jamais adhesion/
autre) — c'est le point commun aux 3 chemins qui font passer une Cotisation "cotisation" à
`payee` (marquer_payee, changer_statut ET le webhook PSP), donc l'endroit naturel pour ce
déclenchement, plutôt que dupliqué dans views.py et webhooks.py.

Même principe, même jour, pour type_article=adhesion (retour utilisateur : "Die Zahlung taucht
nicht im Modul Ausstehende Zahlungen" — voir apps.adhesions.services.synchroniser_cotisation pour
la création de la Cotisation liée) : `notifier_paiement_confirme` fait aussi passer la/les
Souscription(s) liées à `payee`. Import d'apps.adhesions ici plutôt que l'inverse : apps.adhesions
ne dépend d'aucun module de apps.cotisations au niveau Python (seule une référence par chaîne de
caractères dans son FK, voir apps.adhesions.models.Souscription.cotisation), donc aucun risque de
cycle. Cascade avant seulement, jamais inverse : voir CotisationViewSet.changer_statut — une
correction rétroactive du statut de la Cotisation ne fait jamais régresser la Souscription, même
philosophie que l'absence de désactivation automatique du membre ci-dessous.
"""

from apps.accounts.models import ROLE_LEVELS, Role
from apps.accounts.services import users_role_at_least
from apps.adhesions.models import StatutSouscription
from apps.membres.models import RaisonChangementStatut, StatutMembre
from apps.membres.services import enregistrer_statut_annuel
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier

from .models import Cotisation, TypeArticle

STAFF_PAIEMENT_ATTENTE_MIN_LEVEL = ROLE_LEVELS[Role.DIR_FINANCIER]


def notifier_nouveau_paiement_attente_staff(cotisation: Cotisation) -> None:
    """Ajoutée le 2026-09-16 (retour utilisateur : couverture "allen Admin Modulen") — appelée
    par `CotisationViewSet.perform_create`, uniquement pour la branche libre-service (un membre
    déclare son propre paiement, qui reste `en_attente` jusqu'à confirmation manuelle, voir
    AHM-53/`/cotisations/en-attente`) : quand c'est le Directeur Financier qui saisit lui-même
    une transaction pour un autre membre, il n'y a personne à notifier de sa propre action.
    Diffusée à tout Directeur Financier+, sans email (file d'attente partagée)."""
    titre = "Nouveau paiement en attente de confirmation"
    message = f"{cotisation.membre} a déclaré un paiement de cotisation {cotisation.annee}."
    for destinataire in users_role_at_least(STAFF_PAIEMENT_ATTENTE_MIN_LEVEL):
        notifier(
            destinataire,
            TypeNotification.COTISATION_PAIEMENT_ATTENTE,
            titre=titre,
            message=message,
            lien="/cotisations/en-attente",
        )


def notifier_paiement_confirme(cotisation: Cotisation) -> None:
    """W-002 étape 4 — appelé juste après que `cotisation.statut` soit passé à `payee` (par
    marquer_payee ou par le webhook PSP), en plus de l'email/reçu déjà envoyé par ces mêmes
    points d'entrée."""
    user = getattr(cotisation.membre, "user", None)
    notifier(
        user,
        TypeNotification.PAIEMENT_CONFIRME,
        titre="Paiement confirmé",
        message=f"Votre cotisation {cotisation.annee} a bien été enregistrée comme payée.",
        # Corrigé le 2026-09-19 (retour utilisateur, clic sur notification sans effet) : la route
        # frontend est "/cotisation" (singulier, voir App.tsx), jamais "/cotisations".
        lien="/cotisation",
    )
    if cotisation.type_article == TypeArticle.COTISATION and cotisation.annee is not None:
        enregistrer_statut_annuel(
            cotisation.membre,
            cotisation.annee,
            StatutMembre.ACTIF,
            RaisonChangementStatut.PAIEMENT_CONFIRME,
            date_effet=cotisation.date_paiement,
        )
    elif cotisation.type_article == TypeArticle.ADHESION:
        # related_name="souscription_adhesion" (ForeignKey, pas OneToOne — voir models.py) :
        # normalement une seule Souscription non payée par Cotisation liée en pratique (voir
        # apps.adhesions.services.synchroniser_cotisation), mais on couvre le queryset entier par
        # robustesse plutôt que .first().
        for souscription in cotisation.souscription_adhesion.exclude(
            statut=StatutSouscription.PAYEE
        ):
            souscription.statut = StatutSouscription.PAYEE
            souscription.save(update_fields=["statut", "updated_at"])


def notifier_relance_cotisation(membre, annee: int, checkpoint: str) -> None:
    """W-001 étape 5 — appelé pour chaque membre relancé par
    `apps.cotisations.tasks._envoyer_relances_pour`, en plus de l'email de relance."""
    user = getattr(membre, "user", None)
    notifier(
        user,
        TypeNotification.RELANCE_COTISATION,
        titre=f"Rappel — cotisation {annee}",
        message=f"Votre cotisation {annee} n'est pas encore réglée.",
        lien="/cotisation",  # voir commentaire de notifier_paiement_confirme ci-dessus
    )

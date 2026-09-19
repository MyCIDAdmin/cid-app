"""
Services — app evenements.

Synchronisation Inscription <-> Cotisation (ajoutée le 2026-09-20, demande utilisateur :
"Wenn ich auf 'Confirmer et payer' clicke, ich soll direkt zur Zahlung springen"). Diagnostic,
au cours de cette même demande : `Inscription.cotisation` existait déjà (FK, voir models.py) mais
rien ne le renseignait jamais — une inscription payante ne produisait donc aucune écriture
Cotisation, et le stepper de paiement en libre-service (CotisationStepperPage) exclut d'ailleurs
explicitement le type d'article "evenement" de son étape 1 ("aucun événement à sélectionner",
scope actée avant même que ce module existe) : il n'existait donc structurellement AUCUN chemin
en libre-service pour régler une inscription payante — ni "Confirmer et payer", ni le bouton
préexistant "Payer maintenant" de l'onglet "Mes inscriptions", qui se contentait déjà de rediriger
vers ce même stepper sans jamais pouvoir y sélectionner "Événement".

Même principe que apps.adhesions.services.synchroniser_cotisation (Souscription), qui suit lui-
même le principe déjà en place pour la cotisation annuelle (AHM-53/AHM-46 : un paiement hors ligne
reste `en_attente` jusqu'à confirmation manuelle par le Directeur Financier/Admin) :
  - `synchroniser_cotisation` ci-dessous crée/actualise une Cotisation (type_article=evenement)
    liée dès que l'inscription est payante et pas encore réglée (`en_attente_paiement`), et
    l'annule si l'inscription est annulée avant paiement. Une ré-inscription (places modifiées)
    avant paiement met à jour cette même écriture plutôt que d'en créer une seconde.
  - La cascade retour (Cotisation -> payee => Inscription -> confirmee) vit côté
    apps.cotisations.notifications.notifier_paiement_confirme — le point commun aux 3 chemins
    existants qui font passer une Cotisation à `payee` (marquer_payee, changer_statut, webhook
    PSP) — plutôt que dupliquée ici. Cascade avant seulement, jamais inverse : une correction
    rétroactive du statut de la Cotisation ne fait jamais régresser l'Inscription.
  - Le montant n'est JAMAIS transmis par le client à la création de cette Cotisation (CLAUDE.md
    §8) : il est repris tel quel d'`inscription.montant_paye`, lui-même déjà recalculé
    serveur (evenement.cout * places, voir EvenementViewSet.inscrire) — ce qui ferme au passage
    l'écart documenté dans apps.cotisations.models.MONTANTS_CATALOGUE ("evenement… hors
    catalogue, au montant transmis par le client") : ce chemin de création directe (hors API
    self-service /cotisations/) ne fait jamais confiance à un montant client.
"""

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle

from .models import Inscription, StatutInscription

#: Statuts Cotisation considérés "pas encore payés" — voir apps.adhesions.services (même
#: constante, même raison).
_STATUTS_COTISATION_NON_PAYEE = {StatutCotisation.EN_ATTENTE, StatutCotisation.ECHOUEE}

#: Statuts Inscription pour lesquels un paiement est dû dans l'immédiat.
_STATUTS_INSCRIPTION_AVEC_PAIEMENT_DU = {StatutInscription.EN_ATTENTE_PAIEMENT}


def synchroniser_cotisation(inscription: Inscription) -> None:
    """
    Aligne `inscription.cotisation` sur `inscription.statut` — à appeler après chaque
    transition de statut d'une Inscription (EvenementViewSet.inscrire(),
    InscriptionViewSet.annuler()), voir docstring de module.
    """
    cotisation = inscription.cotisation

    if inscription.statut in _STATUTS_INSCRIPTION_AVEC_PAIEMENT_DU:
        libelle = f"Inscription — {inscription.evenement.titre}"
        if cotisation is not None and cotisation.statut in _STATUTS_COTISATION_NON_PAYEE:
            # Ré-inscription avant paiement (nombre de places modifié) : on met à jour cette
            # même écriture plutôt que d'en créer une seconde en attente pour la même
            # inscription.
            cotisation.montant = inscription.montant_paye
            cotisation.libelle = libelle
            cotisation.save(update_fields=["montant", "libelle", "updated_at"])
            return
        nouvelle_cotisation = Cotisation.objects.create(
            membre=inscription.membre,
            type_article=TypeArticle.EVENEMENT,
            libelle=libelle,
            montant=inscription.montant_paye,
            statut=StatutCotisation.EN_ATTENTE,
        )
        inscription.cotisation = nouvelle_cotisation
        inscription.save(update_fields=["cotisation", "updated_at"])
        return

    # Inscription annulée (ou gratuite, qui ne passe jamais par cette branche) : une Cotisation
    # liée pas encore payée n'a plus lieu de rester ouverte pour un paiement qui n'est plus dû.
    if cotisation is not None and cotisation.statut in _STATUTS_COTISATION_NON_PAYEE:
        cotisation.statut = StatutCotisation.ANNULEE
        cotisation.save(update_fields=["statut", "updated_at"])

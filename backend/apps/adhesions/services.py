"""
Services — app adhesions.

Synchronisation Souscription <-> Cotisation (ajoutée le 2026-09-19, demande utilisateur :
"Die Zahlung taucht nicht im Modul Ausstehende Zahlungen"). Diagnostic : `Souscription.cotisation`
existait déjà (FK, voir models.py) mais rien ne le renseignait jamais — une souscription passée en
`en_attente_paiement` (SouscriptionViewSet.souscrire / JustificatifRabaisViewSet.valider) ne
produisait donc aucune écriture Cotisation, le seul registre que consulte le module "Ausstehende
Zahlungen" (apps.cotisations, voir CotisationsEnAttentePage côté frontend) — la souscription ne
pouvait donc structurellement jamais y apparaître, ni être confirmée par le Directeur Financier.

Décision (suit le principe déjà en place pour la cotisation annuelle, AHM-53/AHM-46 : un paiement
hors ligne reste `en_attente` jusqu'à confirmation manuelle par le Directeur Financier/Admin) :
  - `synchroniser_cotisation` ci-dessous crée/actualise une Cotisation (type_article=adhesion)
    liée dès que la souscription atteint `en_attente_paiement` (prête à payer, hors ligne comme
    en ligne — voir CotisationViewSet.marquer_payee/changer_statut/webhooks, réutilisés tels
    quels, aucun nouveau point d'écriture financier n'est introduit) ; une ré-souscription avant
    paiement (nouvelle offre/nouveau rabais) met à jour cette même écriture plutôt que d'en créer
    une seconde ; et une souscription qui n'a plus de paiement dû dans l'immédiat (justificatif de
    nouveau requis, rabais refusé, annulation) annule la Cotisation liée si elle n'était pas
    encore payée.
  - La cascade retour (Cotisation -> payee => Souscription -> payee) vit côté
    apps.cotisations.notifications.notifier_paiement_confirme — c'est le point commun aux 3
    chemins existants qui font passer une Cotisation à `payee` (marquer_payee, changer_statut,
    webhook PSP), donc l'endroit naturel, plutôt que dupliqué ici. Cascade avant seulement, jamais
    inverse : une correction rétroactive du statut de la Cotisation (changer_statut) ne fait
    jamais régresser la Souscription — même philosophie que l'absence de désactivation
    automatique du membre documentée dans changer_statut.
"""

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle

from .models import Souscription, StatutSouscription

#: Statuts Cotisation considérés "pas encore payés" — une Cotisation dans l'un de ces statuts est
#: celle qu'on met à jour en place (ré-souscription) ou qu'on annule (paiement plus dû dans
#: l'immédiat), jamais une Cotisation déjà payee/remboursee (registre append-only, voir
#: apps.cotisations.models.Cotisation).
_STATUTS_COTISATION_NON_PAYEE = {StatutCotisation.EN_ATTENTE, StatutCotisation.ECHOUEE}

#: Statuts Souscription pour lesquels un paiement est dû dans l'immédiat — une Cotisation liée non
#: payée doit exister pour apparaître dans "Ausstehende Zahlungen".
_STATUTS_SOUSCRIPTION_AVEC_PAIEMENT_DU = {StatutSouscription.EN_ATTENTE_PAIEMENT}


def synchroniser_cotisation(souscription: Souscription) -> None:
    """
    Aligne `souscription.cotisation` sur `souscription.statut` — à appeler après chaque
    transition de statut d'une Souscription (souscrire(), JustificatifRabaisViewSet.valider(),
    annuler()), voir docstring de module.
    """
    cotisation = souscription.cotisation

    if souscription.statut in _STATUTS_SOUSCRIPTION_AVEC_PAIEMENT_DU:
        libelle = f"Adhésion {souscription.campagne.nom} — {souscription.offre.nom}"
        if cotisation is not None and cotisation.statut in _STATUTS_COTISATION_NON_PAYEE:
            # Ré-souscription avant paiement (offre/rabais changé, voir souscrire()) : on met à
            # jour cette même écriture plutôt que d'en créer une seconde en attente pour la même
            # souscription.
            cotisation.montant = souscription.prix_paye
            cotisation.libelle = libelle
            cotisation.save(update_fields=["montant", "libelle", "updated_at"])
            return
        nouvelle_cotisation = Cotisation.objects.create(
            membre=souscription.membre,
            type_article=TypeArticle.ADHESION,
            libelle=libelle,
            montant=souscription.prix_paye,
            statut=StatutCotisation.EN_ATTENTE,
        )
        souscription.cotisation = nouvelle_cotisation
        souscription.save(update_fields=["cotisation", "updated_at"])
        return

    # Statut ne nécessitant plus de paiement dans l'immédiat (de nouveau en attente de
    # justificatif, rabais refusé, annulée...) : une Cotisation liée pas encore payée n'a plus
    # lieu de rester dans "Ausstehende Zahlungen" pour un paiement qui n'est plus dû maintenant.
    if cotisation is not None and cotisation.statut in _STATUTS_COTISATION_NON_PAYEE:
        cotisation.statut = StatutCotisation.ANNULEE
        cotisation.save(update_fields=["statut", "updated_at"])

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

from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.cotisations.models import Cotisation, StatutCotisation, TypeArticle
from apps.zentral.models import ZentraleEinstellungen

from .models import Evenement, Inscription, StatutEvenement, StatutInscription

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


# ---------------------------------------------------------------------------------------------
# Zahlungsfrist + Warteliste (2026-10-20)
#
# Nur bei Veranstaltungen mit begrenzter Teilnehmerzahl (`places_max`) und nur, wenn die
# Teilnahme bezahlt werden muss (Status `en_attente_paiement`): die Anmeldung bekommt eine Frist
# (zentral einstellbar, Standard 2 Tage). Läuft sie ab, wird die Anmeldung storniert, der Platz
# wird frei und die Warteliste rückt in der Reihenfolge der Anmeldung nach — die nachrückende
# Person erhält ihrerseits eine neue Frist. Reine Regionen-Veranstaltungen (apps.regionen) haben
# keine Zahlung und sind davon nicht betroffen.
# ---------------------------------------------------------------------------------------------


def zahlungsfrist_ende(evenement: Evenement, ab=None):
    """Ende der Zahlungsfrist für eine neue/nachrückende Anmeldung — `None` bei unbegrenzten
    Veranstaltungen (dort gilt weiterhin nur `date_limite_paiement`)."""
    if evenement.places_max is None:
        return None
    tage = ZentraleEinstellungen.get_solo().event_zahlungsfrist_tage
    return (ab or timezone.now()) + timedelta(days=tage)


def _benoetigte_plaetze(inscription: Inscription) -> int:
    return (
        inscription.places
        + inscription.nombre_accompagnants_adultes
        + inscription.nombre_accompagnants_enfants
    )


def warteliste_position(inscription: Inscription) -> int | None:
    """1 = als Nächstes dran; `None`, wenn nicht auf der Warteliste."""
    if inscription.statut != StatutInscription.LISTE_ATTENTE or inscription.warteliste_seit is None:
        return None
    return (
        Inscription.objects.filter(
            evenement=inscription.evenement,
            statut=StatutInscription.LISTE_ATTENTE,
            warteliste_seit__lt=inscription.warteliste_seit,
        ).count()
        + 1
    )


def warteliste_nachruecken(evenement_id) -> list[Inscription]:
    """Lässt Wartende in der Reihenfolge ihrer Anmeldung nachrücken, solange Platz frei ist.
    Wer nicht mehr hineinpasst (große Gruppe), wird übersprungen — kleinere dahinter dürfen
    nachrücken. Gibt die nachgerückten Anmeldungen zurück (für die Benachrichtigung)."""
    from . import tasks  # lokal: tasks nutzt services nicht, vermeidet Importreihenfolge-Probleme

    nachgerueckt: list[Inscription] = []
    with transaction.atomic():
        evenement = Evenement.objects.select_for_update().get(pk=evenement_id)
        if evenement.statut != StatutEvenement.PUBLIE:
            return []
        wartende = (
            Inscription.objects.filter(evenement=evenement, statut=StatutInscription.LISTE_ATTENTE)
            .select_related("membre", "evenement")
            .order_by("warteliste_seit", "created_at")
        )
        for inscription in wartende:
            if evenement.places_max is not None:
                frei = evenement.places_max - evenement.places_reservees
                if _benoetigte_plaetze(inscription) > frei:
                    continue
            if inscription.montant_paye > 0:
                inscription.statut = StatutInscription.EN_ATTENTE_PAIEMENT
                inscription.zahlungsfrist_bis = zahlungsfrist_ende(evenement)
            else:
                inscription.statut = StatutInscription.CONFIRMEE
                inscription.zahlungsfrist_bis = None
            inscription.frist_erinnerung_gesendet_am = None
            inscription.warteliste_seit = None
            inscription.save()
            synchroniser_cotisation(inscription)
            nachgerueckt.append(inscription)

    for inscription in nachgerueckt:
        tasks.benachrichtige.delay("nachgerueckt", str(inscription.pk))
    return nachgerueckt


def unbezahlte_stornieren(jetzt=None) -> int:
    """Storniert Anmeldungen, deren Zahlungsfrist abgelaufen ist, gibt die Plätze frei und lässt
    die Warteliste nachrücken. Gibt die Zahl stornierter Anmeldungen zurück."""
    from . import tasks

    jetzt = jetzt or timezone.now()
    abgelaufen = list(
        Inscription.objects.filter(
            statut=StatutInscription.EN_ATTENTE_PAIEMENT,
            zahlungsfrist_bis__isnull=False,
            zahlungsfrist_bis__lt=jetzt,
        ).select_related("evenement", "membre", "cotisation")
    )
    storniert = 0
    betroffene_events = set()
    for inscription in abgelaufen:
        with transaction.atomic():
            aktuell = Inscription.objects.select_for_update().get(pk=inscription.pk)
            if aktuell.statut != StatutInscription.EN_ATTENTE_PAIEMENT:
                continue
            cotisation = aktuell.cotisation
            if cotisation is not None and cotisation.statut == StatutCotisation.PAYEE:
                # Zahlung ist eingegangen, Status nur noch nicht übernommen — nicht stornieren.
                aktuell.statut = StatutInscription.CONFIRMEE
                aktuell.zahlungsfrist_bis = None
                aktuell.save(update_fields=["statut", "zahlungsfrist_bis", "updated_at"])
                continue
            aktuell.statut = StatutInscription.ANNULEE
            aktuell.zahlungsfrist_bis = None
            aktuell.save(update_fields=["statut", "zahlungsfrist_bis", "updated_at"])
            synchroniser_cotisation(aktuell)
        storniert += 1
        betroffene_events.add(aktuell.evenement_id)
        tasks.benachrichtige.delay("frist_abgelaufen", str(aktuell.pk))
    for evenement_id in betroffene_events:
        warteliste_nachruecken(evenement_id)
    return storniert

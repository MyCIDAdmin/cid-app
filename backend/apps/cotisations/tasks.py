"""
Tâches Celery — app cotisations.

AHM-18 (RICEFW W-001, "Pipeline relance cotisation") : Celery Beat déclenche
`envoyer_relances_cotisation` tous les jours à 9h00 (planification créée par la migration
0003_planifier_relance_cotisation, django-celery-beat DatabaseScheduler). La tâche elle-même ne
fait quelque chose que les jours où un checkpoint (J-30/J-7/J+1) tombe pour au moins une année de
cotisation — voir `_checkpoints_du_jour` — les autres jours elle se termine immédiatement (no-op),
conformément à l'étape 2 du RICEFW ("Filtrer J-30/J-7/J+1").

Date d'échéance (AHM-54, suite retour utilisateur sur AHM-18) : configurable par année de
cotisation par le Directeur Financier/Admin via ConfigurationRelance (voir models.py et
views.py). Une année sans configuration explicite retombe sur le comportement historique
introduit par AHM-18 : échéance au 1er janvier de cette année N, identique pour tous les membres
(pas de cycle individuel par date d'adhésion — cohérent avec le tarif catalogue annuel unique,
MONTANTS_CATALOGUE, et le champ Cotisation.annee). Dans les deux cas, seule la date pivot change :
les 3 checkpoints restent à J-30/J-7/J+1 par rapport à elle. Avec l'échéance par défaut (1er
janvier N) cela donne :
  J-30 -> 2 décembre N-1
  J-7  -> 25 décembre N-1
  J+1  -> 2 janvier N (cotisation en retard)

Comme la date pivot peut désormais différer d'une année à l'autre, deux années distinctes
peuvent en théorie avoir un checkpoint le même jour calendaire (ex. échéance 2027 configurée
tardivement au point de coïncider avec le J+1 par défaut de 2028) : `_checkpoints_du_jour`
retourne donc une liste, et la tâche envoie les relances pour chaque (checkpoint, année) trouvé.

Notification in-app (RICEFW W-001 étape 5) : différée à la Phase 2B avec le reste de
apps.notifications (encore un module vide à ce stade, voir CLAUDE.md §7 et son propre
models.py) — ce ticket ne couvre que l'email. `RelanceCotisation` (models.py) journalise chaque
envoi réussi (étape 6 "Logger résultat") et sert de verrou d'idempotence : si la tâche est
rejouée le même jour (double déclenchement Beat, retry manuel...), un membre déjà relancé pour ce
(annee, checkpoint) n'est pas recontacté.
"""

import logging
from datetime import date, timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
from django.utils import timezone

from apps.membres.models import Membre, StatutMembre

from .models import (
    MONTANTS_CATALOGUE,
    CheckpointRelance,
    ConfigurationRelance,
    RelanceCotisation,
    StatutCotisation,
    TypeArticle,
)

logger = logging.getLogger(__name__)

# Décalages des 3 checkpoints par rapport à la date d'échéance (AHM-54) — voir docstring de
# module. Négatif = avant l'échéance, positif = après.
DECALAGES_CHECKPOINT = {
    CheckpointRelance.J_MOINS_30: -30,
    CheckpointRelance.J_MOINS_7: -7,
    CheckpointRelance.J_PLUS_1: 1,
}

# fr par défaut, de si préférence explicite — ar retombe sur fr (même règle que
# apps.cotisations.pdf._resoudre_langue, pas encore de contenu AR pour ce module, R2).
TRADUCTIONS_RELANCE = {
    "fr": {
        CheckpointRelance.J_MOINS_30: {
            "sujet": "Cotisation annuelle {annee} — à régler avant le 1er janvier",
            "corps": (
                "Bonjour {prenom},\n\n"
                "Votre cotisation annuelle {annee} ({montant} €) n'est pas encore réglée. "
                "Vous avez jusqu'au 1er janvier {annee} pour la régler depuis l'application, "
                'rubrique "Cotisation".\n\n'
                "Merci de votre soutien à l'association.\n\n"
                "L'équipe Clubistes in Deutschland"
            ),
        },
        CheckpointRelance.J_MOINS_7: {
            "sujet": "Rappel — cotisation annuelle {annee} toujours en attente (plus que 7 jours)",
            "corps": (
                "Bonjour {prenom},\n\n"
                "Il ne reste que 7 jours pour régler votre cotisation annuelle {annee} "
                "({montant} €). Réglez-la dès maintenant depuis l'application, rubrique "
                '"Cotisation", pour éviter tout retard.\n\n'
                "Merci de votre soutien à l'association.\n\n"
                "L'équipe Clubistes in Deutschland"
            ),
        },
        CheckpointRelance.J_PLUS_1: {
            "sujet": "Cotisation annuelle {annee} en retard",
            "corps": (
                "Bonjour {prenom},\n\n"
                "Votre cotisation annuelle {annee} ({montant} €) est en retard depuis le "
                "1er janvier. Merci de la régler dès que possible depuis l'application, "
                'rubrique "Cotisation".\n\n'
                "Contactez l'association si vous rencontrez une difficulté pour la régler.\n\n"
                "L'équipe Clubistes in Deutschland"
            ),
        },
    },
    "de": {
        CheckpointRelance.J_MOINS_30: {
            "sujet": "Jahresbeitrag {annee} — fällig vor dem 1. Januar",
            "corps": (
                "Hallo {prenom},\n\n"
                "Ihr Jahresbeitrag {annee} ({montant} €) wurde noch nicht beglichen. Sie "
                'haben bis zum 1. Januar {annee} Zeit, ihn über die App unter "Mitgliedsbeitrag" '
                "zu bezahlen.\n\n"
                "Vielen Dank für Ihre Unterstützung des Vereins.\n\n"
                "Das Team von Clubistes in Deutschland"
            ),
        },
        CheckpointRelance.J_MOINS_7: {
            "sujet": "Erinnerung — Jahresbeitrag {annee} noch ausstehend (nur noch 7 Tage)",
            "corps": (
                "Hallo {prenom},\n\n"
                "Es bleiben nur noch 7 Tage, um Ihren Jahresbeitrag {annee} ({montant} €) zu "
                'begleichen. Bezahlen Sie ihn jetzt über die App unter "Mitgliedsbeitrag", um '
                "einen Verzug zu vermeiden.\n\n"
                "Vielen Dank für Ihre Unterstützung des Vereins.\n\n"
                "Das Team von Clubistes in Deutschland"
            ),
        },
        CheckpointRelance.J_PLUS_1: {
            "sujet": "Jahresbeitrag {annee} überfällig",
            "corps": (
                "Hallo {prenom},\n\n"
                "Ihr Jahresbeitrag {annee} ({montant} €) ist seit dem 1. Januar überfällig. "
                "Bitte begleichen Sie ihn so bald wie möglich über die App unter "
                '"Mitgliedsbeitrag".\n\n'
                "Kontaktieren Sie den Verein, falls Sie Schwierigkeiten bei der Zahlung haben.\n\n"
                "Das Team von Clubistes in Deutschland"
            ),
        },
    },
}


def _echeance_par_defaut(annee: int) -> date:
    """Comportement historique AHM-18 pour une année sans ConfigurationRelance : 1er janvier."""
    return date(annee, 1, 1)


def _checkpoints_du_jour(today: date) -> list[tuple[str, int]]:
    """
    Retourne la liste des (checkpoint, annee_cible) pour lesquels `today` correspond à l'un des 3
    jalons — vide si aucun. Deux sources, voir docstring de module :
      1. Les années explicitement configurées (ConfigurationRelance, AHM-54) : la date pivot est
         `date_echeance`, quelle que soit sa valeur.
      2. Les années sans configuration explicite : repli sur l'échéance par défaut du 1er
         janvier (comportement historique AHM-18) — seules 2 années candidates peuvent matcher un
         1er janvier vu depuis `today` (celle dont le 1er janvier tombe -30/-7/+1 jour).
    """
    resultats: list[tuple[str, int]] = []
    annees_configurees: set[int] = set()

    configs = ConfigurationRelance.objects.filter(
        Q(date_echeance=today + timedelta(days=30))
        | Q(date_echeance=today + timedelta(days=7))
        | Q(date_echeance=today - timedelta(days=1))
    )
    for config in configs:
        annees_configurees.add(config.annee)
        decalage = (today - config.date_echeance).days
        for checkpoint, decalage_attendu in DECALAGES_CHECKPOINT.items():
            if decalage == decalage_attendu:
                resultats.append((checkpoint, config.annee))

    for annee_candidate in {today.year, today.year + 1}:
        if annee_candidate in annees_configurees:
            continue  # une configuration explicite existe pour cette année : pas de repli
        if ConfigurationRelance.objects.filter(annee=annee_candidate).exists():
            continue  # idem, même si elle ne matche pas aujourd'hui — jamais de repli sur Jan 1er
        echeance = _echeance_par_defaut(annee_candidate)
        decalage = (today - echeance).days
        for checkpoint, decalage_attendu in DECALAGES_CHECKPOINT.items():
            if decalage == decalage_attendu:
                resultats.append((checkpoint, annee_candidate))

    return resultats


def _envoyer_relances_pour(checkpoint: str, annee: int) -> int:
    """Envoie la relance `checkpoint` aux membres actifs sans cotisation payée pour `annee`."""
    membres_a_relancer = (
        Membre.objects.filter(statut=StatutMembre.ACTIF)
        .exclude(
            cotisations__type_article=TypeArticle.COTISATION,
            cotisations__annee=annee,
            cotisations__statut=StatutCotisation.PAYEE,
        )
        .select_related("user")
    )

    montant = MONTANTS_CATALOGUE[TypeArticle.COTISATION]
    envoyes = 0

    for membre in membres_a_relancer:
        user = membre.user
        if not user or not user.email:
            continue  # fiche importée (RICEFW C-001) sans compte de connexion — pas d'email
        if RelanceCotisation.objects.filter(
            membre=membre, annee=annee, checkpoint=checkpoint
        ).exists():
            continue  # idempotence : déjà relancé pour ce (membre, année, checkpoint)

        langue = user.langue_preferee if user.langue_preferee in TRADUCTIONS_RELANCE else "fr"
        textes = TRADUCTIONS_RELANCE[langue][checkpoint]
        contexte = {
            "prenom": membre.prenom,
            "annee": annee,
            "montant": f"{montant:.2f}".replace(".", ","),
        }

        resultat = send_mail(
            subject=textes["sujet"].format(**contexte),
            message=textes["corps"].format(**contexte),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            # Un envoi échoué (SMTP momentanément indisponible) ne doit pas interrompre la
            # boucle pour les membres suivants ; on ne journalise (et donc ne "consomme" le
            # verrou d'idempotence) qu'en cas de succès, voir ci-dessous.
            fail_silently=True,
        )
        if resultat:
            RelanceCotisation.objects.create(membre=membre, annee=annee, checkpoint=checkpoint)
            envoyes += 1
        else:
            logger.warning(
                "envoyer_relances_cotisation: échec d'envoi pour membre=%s checkpoint=%s annee=%s",
                membre.id,
                checkpoint,
                annee,
            )

    return envoyes


@shared_task
def envoyer_relances_cotisation(today: date | None = None):
    """
    W-001 — appelée par Celery Beat sans argument (today=None -> date du jour réelle) ; `today`
    n'est exposé qu'à des fins de test, pour ne pas dépendre d'un outil de gel du temps absent
    des dépendances du projet.
    """
    today = today or timezone.localdate()
    checkpoints = _checkpoints_du_jour(today)

    details = []
    for checkpoint, annee in checkpoints:
        envoyes = _envoyer_relances_pour(checkpoint, annee)
        details.append({"checkpoint": checkpoint, "annee": annee, "envoyes": envoyes})
        logger.info(
            "envoyer_relances_cotisation: checkpoint=%s annee=%s envoyes=%s",
            checkpoint,
            annee,
            envoyes,
        )

    return {"details": details, "envoyes": sum(d["envoyes"] for d in details)}

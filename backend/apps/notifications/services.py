"""
Point d'intégration unique pour créer une notification in-app depuis n'importe quel autre app
(accounts, cotisations, evenements, boutique, à terme vote) — voir models.py pour la liste des
11 types R1.

Utilisation type, à l'intérieur d'une tâche Celery ou d'une action de vue qui vient d'envoyer
l'email correspondant (jamais à la place) :

    from apps.notifications.models import TypeNotification
    from apps.notifications.services import notifier

    notifier(
        cotisation.membre.user,
        TypeNotification.PAIEMENT_CONFIRME,
        titre="Paiement confirmé",
        message=f"Votre cotisation {cotisation.annee} a bien été enregistrée.",
        lien="/cotisations",
    )

Toujours importé localement (dans le corps de la fonction appelante), jamais en haut de fichier,
dans les autres apps — cohérent avec la convention déjà en place pour les imports de `User` dans
apps.accounts.tasks : évite tout risque de dépendance circulaire ou d'ordre de chargement entre
apps au démarrage de Django.
"""

from .models import Notification


def notifier(destinataire, type_notification, *, titre, message, lien=""):
    """Crée une notification in-app pour `destinataire` (instance User — jamais Membre, voir
    docstring models.py). Ne fait rien si `destinataire` est None (ex. membre sans compte User
    encore lié) plutôt que de lever une erreur : l'email reste le canal principal, l'absence de
    notification in-app pour un destinataire non identifiable n'est jamais bloquante."""
    if destinataire is None:
        return None
    return Notification.objects.create(
        destinataire=destinataire,
        type_notification=type_notification,
        titre=titre,
        message=message,
        lien=lien,
    )

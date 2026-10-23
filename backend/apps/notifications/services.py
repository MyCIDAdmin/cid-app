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
        lien="/cotisation",
    )

Toujours importé localement (dans le corps de la fonction appelante), jamais en haut de fichier,
dans les autres apps — cohérent avec la convention déjà en place pour les imports de `User` dans
apps.accounts.tasks : évite tout risque de dépendance circulaire ou d'ordre de chargement entre
apps au démarrage de Django.
"""

from .models import Notification, ParametresNotification, TypeNotification


def email_module_actif(module: str) -> bool:
    """True si l'Administrateur App n'a pas désactivé les emails de notification du module donné
    (voir ParametresNotification/MODULES_NOTIFIABLES, docstring de models.py) — fail-OPEN (True)
    pour un nom de module inconnu, afin qu'un futur module qui oublierait d'appeler cette
    fonction avec le bon nom continue simplement d'envoyer ses emails plutôt que de les couper
    silencieusement. N'affecte jamais la notification in-app correspondante (`notifier`
    ci-dessous), toujours créée indépendamment de ce paramétrage.

    Utilisation type, à l'endroit exact où l'email seul (jamais l'événement métier qui
    l'accompagne) doit être court-circuité :

        from apps.notifications.services import email_module_actif

        if email_module_actif("boutique"):
            send_mail(...)
    """
    parametres = ParametresNotification.get_solo()
    return bool(getattr(parametres, f"email_{module}", True))


def notifier(destinataire, type_notification, *, titre, message, lien=""):
    """Crée une notification in-app pour `destinataire` (instance User — jamais Membre, voir
    docstring models.py). Ne fait rien si `destinataire` est None (ex. membre sans compte User
    encore lié) plutôt que de lever une erreur : l'email reste le canal principal, l'absence de
    notification in-app pour un destinataire non identifiable n'est jamais bloquante."""
    if destinataire is None:
        return None
    notification = Notification.objects.create(
        destinataire=destinataire,
        type_notification=type_notification,
        titre=titre,
        message=message,
        lien=lien,
    )
    if type_notification != TypeNotification.TICKET_BEREIT:
        _telegram_nachreichen(notification)
    return notification


def _telegram_nachreichen(notification) -> None:
    """Schickt die Benachrichtigung zusätzlich nach Telegram, falls das Konto verbunden ist und
    die Art der Benachrichtigung gewählt hat (Release 32). Stört nie die eigentliche Aktion."""
    from django.db import transaction

    from . import telegram
    from .models import TelegramVerknuepfung

    try:
        if not telegram.bot_konfiguriert():
            return
        verknuepfung = TelegramVerknuepfung.objects.filter(
            user=notification.destinataire, chat_id__isnull=False
        ).first()
        if verknuepfung is None:
            return
        if telegram.kategorie_von(notification.type_notification) not in verknuepfung.kategorien:
            return
        from .tasks import sende_telegram

        transaction.on_commit(lambda: sende_telegram.delay(str(notification.pk)))
    except Exception:
        import logging

        logging.getLogger(__name__).exception("Telegram-Versand nicht eingeplant")

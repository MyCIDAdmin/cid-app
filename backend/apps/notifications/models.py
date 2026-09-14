"""
Modèles — app notifications.

R1 P0 — Modèle notification in-app + tâches Celery email (11 types R1, voir CID-RPL-001 §2.2 :
bienvenue, paiement confirmé, relance cotisation (J-30/J-7/J+1 = 3 types), invitation
événement, rappel événement, commande boutique confirmée, commande boutique expédiée, vote
ouvert, résultats de vote = 11) (RICEFW W-001 à W-006).

Ce module ne réimplémente pas l'envoi d'email — chaque app (accounts, cotisations, evenements,
boutique, à terme vote) garde ses propres tâches Celery d'envoi (`send_mail`), comme c'était déjà
le cas avant ce ticket. Ce que ce module ajoute, c'est la brique manquante commune aux 11 types :
un fil de notifications in-app par utilisateur (`Notification`) et la fonction `services.notifier`
que les autres apps appellent en plus de leur email existant — voir son docstring pour le détail
des points d'intégration (apps.accounts.tasks, apps.cotisations.{views,webhooks,tasks},
apps.evenements.tasks, apps.boutique.views).

Destinataire porté par `User` (jamais `Membre`) : l'API "mes notifications" liste toujours
`request.user`, et un compte RH/Bureau Admin/DG sans fiche Membre à jour doit pouvoir recevoir des
notifications de gestion (ex. relance justificatif) au même titre qu'un membre normal.
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class TypeNotification(models.TextChoices):
    """Les 11 types R1 (CID-RPL-001 §2.2) — vote_ouverture/vote_resultats ne sont pas encore
    déclenchés (apps.vote n'existe pas avant la Phase 3) mais sont déjà répertoriés ici pour que
    le modèle n'ait pas à être remanié quand ce module sera construit."""

    BIENVENUE = "bienvenue", _("Bienvenue")
    PAIEMENT_CONFIRME = "paiement_confirme", _("Paiement confirmé")
    RELANCE_COTISATION = "relance_cotisation", _("Relance cotisation")
    EVENEMENT_INVITATION = "evenement_invitation", _("Invitation à un événement")
    EVENEMENT_RAPPEL = "evenement_rappel", _("Rappel d'événement")
    BOUTIQUE_COMMANDE_CONFIRMEE = "boutique_commande_confirmee", _("Commande confirmée")
    BOUTIQUE_COMMANDE_EXPEDIEE = "boutique_commande_expediee", _("Commande expédiée")
    VOTE_OUVERTURE = "vote_ouverture", _("Ouverture d'un vote")
    VOTE_RESULTATS = "vote_resultats", _("Résultats d'un vote")
    MESSAGE_PRIVE_RECU = "message_prive_recu", _("Nouveau message privé")


class Notification(models.Model):
    """Une notification in-app — toujours créée en plus (jamais à la place) de l'email
    correspondant. Purement additive/consultative : aucune action métier ne dépend de son
    existence, donc aucune contrainte d'unicité ni de transaction partagée avec l'événement
    déclencheur n'est nécessaire."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    destinataire = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    type_notification = models.CharField(max_length=30, choices=TypeNotification.choices)
    titre = models.CharField(max_length=200)
    message = models.TextField()
    lien = models.CharField(
        max_length=255,
        blank=True,
        help_text=_("Chemin relatif frontend vers l'objet concerné (ex. /evenements/<id>)."),
    )
    lu = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        verbose_name = _("Notification")
        verbose_name_plural = _("Notifications")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["destinataire", "lu"]),
        ]

    def __str__(self):
        return f"{self.get_type_notification_display()} — {self.destinataire}"

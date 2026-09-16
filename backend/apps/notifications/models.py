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

8 types supplémentaires ajoutés le 2026-09-16 (demande utilisateur : "Baue notification wo du
siehst, dass es Sinn macht") pour des événements jusque-là silencieux — voir chaque app pour le
point d'intégration exact : apps.adhesions.{tasks,notifications,views} (campagne publiée,
justificatif validé/rejeté, souscription annulée), apps.evenements.tasks (événement annulé),
apps.boutique.notifications (commande annulée), apps.communaute.notifications (nouvelle réponse
de forum — uniquement l'auteur du sujet et les précédents répondants, jamais tous les membres,
pour ne pas multiplier les écritures en base sur un forum actif).

6 types supplémentaires ajoutés le 2026-09-16, suite au retour utilisateur ("Es soll bei allen
Admin Modulen aber auch bei Messaging und Austausch Modulen funktionieren") : couvrent cette
fois deux angles jusque-là absents — (a) notifications "staff" (nouvel élément en attente
d'action, diffusées à tout un rôle et au-dessus via apps.accounts.services.users_role_at_least,
jamais à un seul destinataire) pour les modules d'administration, et (b) notifications membres
sur les modules d'échange/messagerie pas encore couverts (fil d'actualité, groupes de chat — la
messagerie privée et le forum avaient déjà leur notification, voir ci-dessus/message_prive_recu).
Points d'intégration : apps.adhesions.{notifications,views} (nouveau justificatif soumis,
RH+), apps.accounts.{tasks,views} (nouvelle inscription en attente, RH+), apps.cotisations.
{notifications,views} (nouveau paiement en attente de confirmation manuelle, Directeur
Financier+), apps.boutique.{notifications,views} (nouvelle commande passée, Bureau Admin+),
apps.communaute.{notifications,views} (nouveau commentaire sur une publication du fil),
apps.communaute.{tasks,consumers} (nouveau message dans un groupe de chat — diffusé à tous les
membres du groupe sauf l'auteur, sans vérification de présence : contrairement à la messagerie
privée 1:1, GroupeChatConsumer ne suit aucune présence, voir docstring de tête consumers.py).

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
    le modèle n'ait pas à être remanié quand ce module sera construit. Les 8 types suivants
    (ADHESION_* à COMMUNAUTE_REPONSE_FORUM) puis les 6 derniers (ADHESION_JUSTIFICATIF_SOUMIS à
    COMMUNAUTE_COMMENTAIRE_FIL) ont été ajoutés le 2026-09-16, voir docstring de module."""

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
    ADHESION_CAMPAGNE_PUBLIEE = "adhesion_campagne_publiee", _("Nouvelle campagne d'adhésion")
    ADHESION_JUSTIFICATIF_VALIDE = "adhesion_justificatif_valide", _("Justificatif validé")
    ADHESION_JUSTIFICATIF_REFUSE = "adhesion_justificatif_refuse", _("Justificatif refusé")
    ADHESION_SOUSCRIPTION_ANNULEE = "adhesion_souscription_annulee", _("Souscription annulée")
    EVENEMENT_ANNULE = "evenement_annule", _("Événement annulé")
    BOUTIQUE_COMMANDE_ANNULEE = "boutique_commande_annulee", _("Commande annulée")
    COMMUNAUTE_REPONSE_FORUM = "communaute_reponse_forum", _("Nouvelle réponse sur un sujet")
    ADHESION_JUSTIFICATIF_SOUMIS = "adhesion_justificatif_soumis", _("Nouveau justificatif soumis")
    ACCOUNTS_NOUVELLE_INSCRIPTION = "accounts_nouvelle_inscription", _("Nouvelle inscription")
    COTISATION_PAIEMENT_ATTENTE = "cotisation_paiement_attente", _("Paiement en attente")
    BOUTIQUE_NOUVELLE_COMMANDE = "boutique_nouvelle_commande", _("Nouvelle commande")
    COMMUNAUTE_MESSAGE_GROUPE = "communaute_message_groupe", _("Nouveau message de groupe")
    COMMUNAUTE_COMMENTAIRE_FIL = "communaute_commentaire_fil", _("Nouveau commentaire")


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

"""
Tâches Celery — app boutique (ajouté le 2026-09-19, correctif : les emails de commande étaient
jusqu'ici envoyés de façon SYNCHRONE depuis apps.boutique.notifications, appelée directement
dans le corps de la requête HTTP (CommandeViewSet.passer/annuler/changer_statut/expedier) —
contrairement à toutes les autres apps du projet (accounts, cotisations, adhesions, evenements,
communaute, vote), qui envoient systématiquement leurs emails via une tâche Celery (`.delay()`),
jamais en ligne dans la vue. Cette incohérence n'avait pas d'impact tant que SMTP n'était pas
configuré (échec quasi instantané, `fail_silently=True` l'avalait) : une fois de vraies
identifiants SMTP renseignés (Brevo), une requête `passer()` s'est mise à bloquer plusieurs
dizaines de secondes — le bouton "Confirmer la commande" restait bloqué côté membre — le temps
que la tentative de connexion SMTP échoue (Railway bloque le SMTP sortant sur les plans
Free/Trial/Hobby, voir docs/RAILWAY.md et Hosting_Migration_Vorschlag.md : la connexion reste
en attente au lieu d'être immédiatement refusée). Ce fichier aligne boutique sur la convention
du reste du projet : la vue continue de créer la notification in-app immédiatement (DB seule,
rapide, voir apps.notifications.services.notifier) mais l'email part désormais en tâche de fond
— la requête HTTP ne dépend donc plus jamais de la disponibilité/latence du serveur SMTP.
"""

import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, send_mail

from apps.notifications.services import email_module_actif

from .models import BonAchat, Commande

logger = logging.getLogger(__name__)


def _destinataire_email(commande: Commande) -> str | None:
    user = getattr(commande.membre, "user", None)
    return user.email if user and user.email else None


def _detail_lignes(commande: Commande) -> str:
    """Détail des articles commandés (demande utilisateur du 2026-09-19 : "Füge zu den
    versendeten Mails mehr Details. z.B. Details zur Bestelleng...") — une ligne par article,
    même contenu que le récapitulatif du stepper frontend (CommandeConfirmationPage)."""
    lignes = [
        f"  - {ligne.variante.produit.nom}"
        + (
            f" ({' / '.join(filter(None, [ligne.variante.taille, ligne.variante.couleur]))})"
            if ligne.variante.taille or ligne.variante.couleur
            else ""
        )
        + f" × {ligne.quantite} — {ligne.sous_total} €"
        for ligne in commande.lignes.all()
    ]
    return "\n".join(lignes)


def _adresse_livraison(commande: Commande) -> str:
    return (
        f"{commande.nom_destinataire}\n"
        f"{commande.adresse_livraison}\n"
        f"{commande.code_postal_livraison} {commande.ville_livraison}, {commande.pays_livraison}"
    )


@shared_task
def envoyer_email_commande_confirmee(commande_id) -> None:
    try:
        commande = (
            Commande.objects.select_related("membre__user")
            .prefetch_related("lignes__variante__produit")
            .get(id=commande_id)
        )
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email or not email_module_actif("boutique"):
        return
    send_mail(
        subject=f"Commande {commande.numero_commande} confirmée",
        message=(
            f"Votre commande {commande.numero_commande} a bien été enregistrée.\n\n"
            f"Articles :\n{_detail_lignes(commande)}\n\n"
            f"Montant total : {commande.montant_total} €\n\n"
            f"Adresse de livraison :\n{_adresse_livraison(commande)}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_commande_annulee(commande_id) -> None:
    try:
        commande = (
            Commande.objects.select_related("membre__user")
            .prefetch_related("lignes__variante__produit")
            .get(id=commande_id)
        )
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email or not email_module_actif("boutique"):
        return
    send_mail(
        subject=f"Commande {commande.numero_commande} annulée",
        message=(
            f"Votre commande {commande.numero_commande} d'un montant de "
            f"{commande.montant_total} € a été annulée.\n\n"
            f"Articles :\n{_detail_lignes(commande)}\n\n"
            "Le stock correspondant a été restitué au catalogue."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_commande_expediee(commande_id) -> None:
    try:
        commande = (
            Commande.objects.select_related("membre__user")
            .prefetch_related("lignes__variante__produit")
            .get(id=commande_id)
        )
    except Commande.DoesNotExist:
        return
    email = _destinataire_email(commande)
    if not email or not email_module_actif("boutique"):
        return
    if commande.numero_suivi:
        suivi = (
            f"Numéro de suivi : {commande.numero_suivi}"
            + (f" ({commande.transporteur})" if commande.transporteur else "")
            + "\n\n"
        )
    else:
        suivi = ""
    send_mail(
        subject=f"Commande {commande.numero_commande} expédiée",
        message=(
            f"Votre commande {commande.numero_commande} vient d'être expédiée.\n\n"
            f"{suivi}"
            f"Articles :\n{_detail_lignes(commande)}\n\n"
            f"Adresse de livraison :\n{_adresse_livraison(commande)}"
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=True,
    )


@shared_task
def envoyer_email_bon_achat_code(bon_achat_id) -> None:
    """Email de bon d'achat (demande utilisateur du 2026-09-23 : "Der Code soll in einer
    schönen Email... geschickt werden") — appelée par notifications.notifier_bon_achat_actif dès
    qu'un BonAchat passe à ACTIF. Seul email HTML du module (voir apps.boutique.emails pour le
    pourquoi) : envoyé via EmailMultiAlternatives (texte brut + alternative HTML), plutôt que
    send_mail (texte brut seul) utilisé par les autres tâches de ce fichier."""
    try:
        bon = BonAchat.objects.select_related("achete_par__user").get(id=bon_achat_id)
    except BonAchat.DoesNotExist:
        return
    user = getattr(bon.achete_par, "user", None)
    email = user.email if user and user.email else None
    if not email or not email_module_actif("boutique"):
        return

    # Import différé (évite tout risque de dépendance circulaire au chargement de l'app, même
    # convention que les imports locaux de apps.notifications.services dans les autres apps).
    from .emails import rendre_email_bon_achat

    sujet, corps_texte, corps_html = rendre_email_bon_achat(bon)
    message = EmailMultiAlternatives(
        subject=sujet,
        body=corps_texte,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[email],
    )
    message.attach_alternative(corps_html, "text/html")
    message.send(fail_silently=True)

"""
Point d'intégration `apps.notifications` pour le forum (ajouté le 2026-09-16, demande
utilisateur : "Baue notification wo du siehst, dass es Sinn macht" — voir aussi tasks.py pour le
même principe déjà en place sur la messagerie privée).

Volontairement PAS un broadcast à tous les membres (contrairement à
apps.evenements.tasks.envoyer_invitations_evenement ou
apps.adhesions.tasks.envoyer_annonce_campagne) : une réponse de forum est un événement bien plus
fréquent sur un forum actif, et informer tout le monde à chaque réponse noierait le fil de
notifications et multiplierait les écritures en base pour peu de valeur. Seuls l'auteur du sujet
et les membres ayant déjà répondu au même sujet sont notifiés — jamais l'auteur de la nouvelle
réponse lui-même.

`notifier_mentions` (ajoutée le 2026-09-29, demande utilisateur : "'@'-Erwähnungen auf weitere
Module wie Forum/Neuigkeiten ausweiten und mit echten Benachrichtigungen versehen") couvre les
mentions "@membre" réelles (avec notification, contrairement aux mentions déjà existantes dans le
groupe de chat qui restent purement cosmétiques côté frontend, voir GroupeChatPage.tsx) sur
Publication/Commentaire (fil d'actualité) et Sujet/ReponseForum (forum). Les membres mentionnés
sont résolus en amont par l'appelant — voir serializers.py (`mentions` pour les champs texte
libre Sujet/ReponseForum/Commentaire, `MENTION_RE` sur le HTML TipTap pour Publication) — cette
fonction ne fait que dispatcher la notification, jamais l'extraction."""

from django.conf import settings
from django.core.mail import send_mail

from apps.notifications.models import TypeNotification
from apps.notifications.services import email_module_actif, notifier

from .models import Commentaire, Publication, ReponseForum, Sujet


def notifier_nouvelle_reponse_forum(reponse) -> None:
    """Appelée par `ReponseForumViewSet.perform_create` juste après la création d'une réponse."""
    sujet = reponse.sujet

    destinataires_membres = {sujet.auteur_id: sujet.auteur}
    autres_repliers = (
        sujet.reponses.exclude(auteur_id=reponse.auteur_id)
        .exclude(id=reponse.id)
        .select_related("auteur")
    )
    for autre in autres_repliers:
        destinataires_membres.setdefault(autre.auteur_id, autre.auteur)

    destinataires_membres.pop(reponse.auteur_id, None)

    lien = f"/forum/{sujet.id}"
    titre = f"Nouvelle réponse — {sujet.titre}"
    for membre in destinataires_membres.values():
        user = getattr(membre, "user", None)
        if not user:
            continue
        if user.email and email_module_actif("communaute"):
            apercu = (reponse.contenu or "")[:150]
            send_mail(
                subject=titre,
                message=(
                    f'{reponse.auteur} a répondu à "{sujet.titre}" sur le forum CID :\n\n'
                    f"« {apercu} »"
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=True,
            )
        notifier(
            user,
            TypeNotification.COMMUNAUTE_REPONSE_FORUM,
            titre=titre,
            message=f'{reponse.auteur} a répondu à "{sujet.titre}".',
            lien=lien,
        )


def notifier_nouveau_commentaire_fil(commentaire) -> None:
    """Appelée par `CommentaireViewSet.perform_create` juste après la création d'un commentaire
    (ou d'une réponse à un commentaire, voir `Commentaire.parent`) — ajoutée le 2026-09-16, même
    principe restrictif que `notifier_nouvelle_reponse_forum` ci-dessus (jamais un broadcast à
    tous les membres) : seuls l'auteur de la publication et, s'il s'agit d'une réponse à un
    commentaire, l'auteur du commentaire parent sont notifiés — jamais l'auteur du nouveau
    commentaire lui-même. Pas d'email (cf. fil d'actualité = flux à fort volume, contrairement
    au forum où chaque sujet reste actif plus longtemps)."""
    publication = commentaire.publication

    destinataires_membres = {publication.auteur_id: publication.auteur}
    if commentaire.parent_id:
        parent = commentaire.parent
        destinataires_membres.setdefault(parent.auteur_id, parent.auteur)

    destinataires_membres.pop(commentaire.auteur_id, None)

    apercu = (publication.contenu or "")[:40]
    # Corrigé le 2026-09-19 (retour utilisateur, clic sur notification sans effet) :
    # "/fil/{id}" ne correspond à aucune route du frontend (pas de page de détail par
    # publication, voir App.tsx) — ?publication= permet à FilPage de retrouver et mettre en
    # évidence la carte correspondante (voir useDeepLinkCible côté frontend).
    lien = f"/fil?publication={publication.id}"
    titre = "Nouveau commentaire"
    for membre in destinataires_membres.values():
        user = getattr(membre, "user", None)
        if not user:
            continue
        notifier(
            user,
            TypeNotification.COMMUNAUTE_COMMENTAIRE_FIL,
            titre=titre,
            message=f"{commentaire.auteur} a commenté « {apercu} ».",
            lien=lien,
        )


def notifier_mentions(objet, membres_mentionnes) -> None:
    """Notifie chaque membre mentionné via "@" — voir docstring de tête de module. `objet` est
    l'instance qui porte la mention (`Publication`, `Commentaire`, `Sujet` ou `ReponseForum`) et
    `membres_mentionnes` un itérable de `Membre` déjà résolus par l'appelant (aucune validation
    d'existence ici — voir serializers.py). Jamais l'auteur de `objet` lui-même, même s'il se
    mentionne (`@moi`), pour ne pas se notifier soi-même."""
    apercu = (objet.contenu or "")[:80]

    if isinstance(objet, Sujet):
        lien = f"/forum/{objet.id}"
        contexte = f"le sujet « {objet.titre} »"
    elif isinstance(objet, ReponseForum):
        lien = f"/forum/{objet.sujet_id}"
        contexte = f"le sujet « {objet.sujet.titre} »"
    elif isinstance(objet, Commentaire):
        lien = f"/fil?publication={objet.publication_id}"
        contexte = "un commentaire du fil d'actualité"
    else:
        assert isinstance(objet, Publication)
        lien = f"/fil?publication={objet.id}"
        contexte = "une publication du fil d'actualité"

    titre = "Vous avez été mentionné·e"
    for membre in membres_mentionnes:
        if membre.id == objet.auteur_id:
            continue
        user = getattr(membre, "user", None)
        if not user:
            continue
        notifier(
            user,
            TypeNotification.COMMUNAUTE_MENTION,
            titre=titre,
            message=f"{objet.auteur} vous a mentionné·e dans {contexte} : « {apercu} »",
            lien=lien,
        )

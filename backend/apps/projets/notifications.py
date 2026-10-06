"""Notifications in-app du volet "espace de travail" des projets (ajouté le 2026-10-06) — mêmes
conventions que apps.boutique.notifications : `notifier` ne fait rien pour un destinataire sans
compte User, jamais d'erreur bloquante. Pas d'email : les rappels restent dans la cloche."""

from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier


def _lien(aufgabe) -> str:
    return f"/projets/{aufgabe.projet_id}/arbeitsbereich"


def notifier_aufgabe_zugewiesen(aufgabe, durch=None) -> None:
    """À la personne responsable d'une tâche, sauf si elle se l'assigne elle-même."""
    ziel = aufgabe.verantwortlich
    if ziel is None or (durch is not None and ziel.id == durch.id):
        return
    notifier(
        getattr(ziel, "user", None),
        TypeNotification.PROJEKT_AUFGABE_ZUGEWIESEN,
        titre=f"Nouvelle tâche : {aufgabe.titel}",
        message=f"Projet « {aufgabe.projet.titre} »",
        lien=_lien(aufgabe),
    )


def notifier_kommentar(kommentar) -> None:
    """Au/à la responsable et à l'auteur·e de la tâche, jamais à l'auteur·e du commentaire."""
    aufgabe = kommentar.aufgabe
    empfaenger = {}
    for membre in (aufgabe.verantwortlich, aufgabe.created_by):
        if membre is not None and (kommentar.autor is None or membre.id != kommentar.autor.id):
            empfaenger[membre.id] = membre
    for membre in empfaenger.values():
        notifier(
            getattr(membre, "user", None),
            TypeNotification.PROJEKT_AUFGABE_KOMMENTAR,
            titre=f"Nouveau commentaire : {aufgabe.titel}",
            message=kommentar.text[:140],
            lien=_lien(aufgabe),
        )


def notifier_aufgabe_faellig(aufgabe, heute: bool) -> None:
    ziel = aufgabe.verantwortlich
    vorspann = "À rendre aujourd'hui" if heute else "À rendre demain"
    notifier(
        getattr(ziel, "user", None),
        TypeNotification.PROJEKT_AUFGABE_FAELLIG,
        titre=f"{vorspann} : {aufgabe.titel}",
        message=f"Projet « {aufgabe.projet.titre} »",
        lien=_lien(aufgabe),
    )

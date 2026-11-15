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


def _stellen_lien(stelle) -> str:
    if stelle.projet_id is None:
        return "/hilfe-gesucht"
    return f"/projets/{stelle.projet_id}/arbeitsbereich?reiter=stellen"


def _name(membre) -> str:
    return f"{membre.prenom} {membre.nom}".strip()


def notifier_bewerbung(bewerbung) -> None:
    """Projektstelle: an die Projektleitung. Freies Gesuch: an die Ersteller·in, die empfiehlt."""
    from .models import ProjetMitglied, RolleProjet

    stelle = bewerbung.stelle
    if stelle.projet_id is None:
        ziele = {}
        if stelle.created_by is not None and stelle.created_by_id != bewerbung.membre_id:
            ziele[stelle.created_by_id] = stelle.created_by
        titel = f"Nouvelle candidature d'aide : {stelle.titel}"
        zeile = f"{_name(bewerbung.membre)} — « {stelle.titel} »"
    else:
        ziele = {
            m.membre_id: m.membre
            for m in ProjetMitglied.objects.filter(
                projet=stelle.projet, rolle=RolleProjet.LEITUNG
            ).select_related("membre__user")
            if m.membre_id != bewerbung.membre_id
        }
        titel = f"Nouvelle candidature : {stelle.titel}"
        zeile = f"{_name(bewerbung.membre)} — « {stelle.projet.titre} »"
    for membre in ziele.values():
        notifier(
            getattr(membre, "user", None),
            TypeNotification.PROJEKT_BEWERBUNG,
            titre=titel,
            message=zeile,
            lien=_stellen_lien(stelle),
        )


def notifier_empfehlung(bewerbung, durch=None) -> None:
    """An alle, die genehmigen dürfen: eine Meldung wurde empfohlen und wartet auf die Freigabe."""
    from .hilfe import genehmiger_nutzer

    stelle = bewerbung.stelle
    for user in genehmiger_nutzer(ausser=getattr(durch, "pk", None)):
        notifier(
            user,
            TypeNotification.PROJEKT_BEWERBUNG,
            titre=f"À approuver : {stelle.titel}",
            message=f"{_name(bewerbung.membre)} est recommandé·e — approbation requise",
            lien=_stellen_lien(stelle),
        )


def notifier_bewerbung_entschieden(bewerbung) -> None:
    """An das Mitglied : Meldung angenommen oder abgelehnt (Glocke, Telegram/Push nach den
    persönlichen Einstellungen) ; bei freien Gesuchen zusätzlich per E-Mail mit dem Hinweis, die
    Kontaktperson im Chat zu erreichen. Kein automatisches Team."""
    from .hilfe import sende_mail
    from .models import StatutBewerbung

    stelle = bewerbung.stelle
    angenommen = bewerbung.status == StatutBewerbung.ANGENOMMEN
    frei = stelle.projet_id is None
    if frei:
        lien = "/hilfe-gesucht"
        zeile = "Demande d'aide"
    else:
        lien = f"/projets/{stelle.projet_id}" + ("/arbeitsbereich" if angenommen else "")
        zeile = f"Projet « {stelle.projet.titre} »"
    notifier(
        getattr(bewerbung.membre, "user", None),
        TypeNotification.PROJEKT_BEWERBUNG_ENTSCHIEDEN,
        titre=("Candidature acceptée : " if angenommen else "Candidature refusée : ")
        + stelle.titel,
        message=zeile,
        lien=lien,
    )
    if frei:
        kontakt = stelle.created_by
        if angenommen:
            text = (
                f"Hallo {bewerbung.membre.prenom},\n\nDeine Meldung für „{stelle.titel}“ wurde "
                "genehmigt. Danke für deine Hilfe!"
            )
            if kontakt is not None:
                text += (
                    f"\n\nAnsprechperson: {_name(kontakt)}. Schreibe ihr/ihm direkt im Chat der "
                    "App, um alles Weitere zu klären."
                )
            sende_mail(bewerbung.membre, f"Hilfe gesucht: Du bist dabei – {stelle.titel}", text)
        else:
            sende_mail(
                bewerbung.membre,
                f"Hilfe gesucht: {stelle.titel}",
                f"Hallo {bewerbung.membre.prenom},\n\nleider können wir deine Meldung für "
                f"„{stelle.titel}“ diesmal nicht berücksichtigen. Danke für dein Angebot!",
            )


def notifier_angebot_neu(angebot) -> None:
    """An alle, die genehmigen dürfen: ein Mitglied bietet von sich aus Hilfe an."""
    from .hilfe import genehmiger_nutzer

    for user in genehmiger_nutzer(
        ausser=getattr(getattr(angebot.membre, "user", None), "pk", None)
    ):
        notifier(
            user,
            TypeNotification.PROJEKT_BEWERBUNG,
            titre=f"Offre d'aide : {angebot.titel}",
            message=f"{_name(angebot.membre)} propose son aide — réponse attendue",
            lien="/projets?tab=hilfe&ansicht=angebote",
        )


def notifier_angebot_entschieden(angebot) -> None:
    """An das Mitglied: Angebot angenommen (mit Hinweis auf den Chat) oder abgelehnt. Glocke,
    Telegram/Push nach den persönlichen Einstellungen, zusätzlich eine kurze Mail."""
    from .hilfe import sende_mail
    from .models import StatutAngebot

    angenommen = angebot.status == StatutAngebot.ANGENOMMEN
    notifier(
        getattr(angebot.membre, "user", None),
        TypeNotification.PROJEKT_BEWERBUNG_ENTSCHIEDEN,
        titre=("Offre acceptée : " if angenommen else "Offre refusée : ") + angebot.titel,
        message=angebot.notiz[:140] or "Offre d'aide",
        lien="/projets?tab=hilfe&ansicht=meine",
    )
    zusatz = f"\n\nNachricht des Büros: {angebot.notiz}" if angebot.notiz else ""
    if angenommen:
        text = (
            f"Hallo {angebot.membre.prenom},\n\ndein Hilfeangebot „{angebot.titel}“ wurde "
            "angenommen. Danke! Das Büro meldet sich bei dir, du erreichst es auch direkt im "
            "Chat der App." + zusatz
        )
        sende_mail(
            angebot.membre, f"Hilfe gesucht: Dein Angebot wurde angenommen – {angebot.titel}", text
        )
    else:
        text = (
            f"Hallo {angebot.membre.prenom},\n\nleider können wir dein Angebot „{angebot.titel}“ "
            "im Moment nicht einsetzen. Danke für dein Angebot!" + zusatz
        )
        sende_mail(angebot.membre, f"Hilfe gesucht: {angebot.titel}", text)

"""Meldungen des Familienpakets — zweisprachige Mail (DE·FR) und In-App-Hinweis.

Die Mail an eine eingeladene Person nennt nur, wer eingeladen hat und welches Angebot gilt ; die
Beträge stehen nicht darin. Versandfehler stören die Aktion nicht.
"""

from apps.accounts.models import ROLE_LEVELS, Role
from apps.accounts.services import users_role_at_least
from apps.kalender.benachrichtigung import sprache
from apps.notifications.email_cid import Texte, envoyer_email_cid
from apps.notifications.models import TypeNotification
from apps.notifications.services import notifier


def _haupt_name(e) -> str:
    m = e.souscription.membre
    return f"{m.prenom} {m.nom}".strip()


def _mail(email, de, fr, *, lien, details=((), ()), cta=("Öffnen", "Ouvrir")) -> None:
    if not email:
        return
    textes = {
        "de": Texte(titre=de[0], paragraphes=[de[1]], details=list(details[0]), cta=cta[0]),
        "fr": Texte(titre=fr[0], paragraphes=[fr[1]], details=list(details[1]), cta=cta[1]),
    }
    envoyer_email_cid(
        sujet=f"{de[0]} · {fr[0]}",
        destinataire=email,
        textes=textes,
        lien=lien,
        fail_silently=True,
    )


def einladung(e, *, konto=None, erinnerung: bool = False) -> None:
    """Einladung oder Erinnerung an die weitere erwachsene Person."""
    haupt = _haupt_name(e)
    angebot = e.angebot.nom if e.angebot else "—"
    kampagne = e.souscription.campagne.nom
    lien = f"/einladung/{e.token}"
    praefix_de, praefix_fr = ("Erinnerung: ", "Rappel : ") if erinnerung else ("", "")
    if konto is not None:
        weiter_de = (
            "Du hast bereits ein Konto. Öffne den Link und bestätige die Einladung. Ohne deine "
            "Zustimmung passiert nichts."
        )
        weiter_fr = (
            "Tu as déjà un compte. Ouvre le lien et confirme l'invitation. Sans ton accord, "
            "rien ne se passe."
        )
    else:
        weiter_de = (
            "Erstelle über den Link ein Konto und ergänze deine Angaben. Danach bist du Mitglied."
        )
        weiter_fr = "Crée un compte via le lien et complète tes informations. Tu es ensuite membre."
    de = (
        f"{praefix_de}Einladung zum Familienpaket",
        f"{haupt} hat dich zum Familienpaket der Clubistes in Deutschland eingeladen und für dich "
        f"bezahlt. {weiter_de} Kennst du die Person nicht, kannst du diese Mail ignorieren.",
    )
    fr = (
        f"{praefix_fr}Invitation au forfait famille",
        f"{haupt} t'a invité·e au forfait famille des Clubistes in Deutschland et a payé pour "
        f"toi. {weiter_fr} Si tu ne connais pas cette personne, ignore ce message.",
    )
    details = (
        [("Angebot", angebot), ("Kampagne", kampagne)],
        [("Offre", angebot), ("Campagne", kampagne)],
    )
    _mail(
        e.email, de, fr, lien=lien, details=details, cta=("Einladung öffnen", "Ouvrir l'invitation")
    )
    if konto is not None and not erinnerung:
        titel, text = (fr[0], fr[1]) if sprache(konto) == "fr" else (de[0], de[1])
        notifier(konto, TypeNotification.FAMILIE_EINLADUNG, titre=titel, message=text, lien=lien)


def antwort_an_hauptperson(e, *, angenommen: bool, konflikt: bool = False) -> None:
    """Hauptperson (und bei einem Konflikt das Büro) erfährt, was aus der Einladung wurde."""
    haupt_user = e.souscription.membre.user
    name = f"{e.vorname} {e.nachname}".strip()
    if konflikt:
        de = (
            "Einladung nicht möglich",
            f"{name} hat für diese Kampagne bereits eine eigene bezahlte Mitgliedschaft. "
            "Das Büro klärt das mit euch.",
        )
        fr = (
            "Invitation impossible",
            f"{name} a déjà sa propre adhésion payée pour cette campagne. Le bureau "
            "clarifiera la situation avec vous.",
        )
    elif angenommen:
        de = ("Einladung angenommen", f"{name} ist jetzt Mitglied in deinem Familienpaket.")
        fr = ("Invitation acceptée", f"{name} est maintenant membre de ton forfait famille.")
    else:
        de = ("Einladung abgelehnt", f"{name} hat die Einladung zum Familienpaket abgelehnt.")
        fr = ("Invitation refusée", f"{name} a refusé l'invitation au forfait famille.")
    lien = "/mon-adhesion"
    if haupt_user is not None and haupt_user.is_active:
        titel, text = fr if sprache(haupt_user) == "fr" else de
        notifier(haupt_user, TypeNotification.FAMILIE_ANTWORT, titre=titel, message=text, lien=lien)
        _mail(haupt_user.email, de, fr, lien=lien, cta=("Zur Mitgliedschaft", "Vers l'adhésion"))
    if konflikt:
        for nutzer in users_role_at_least(ROLE_LEVELS[Role.RH]):
            notifier(
                nutzer,
                TypeNotification.FAMILIE_ANTWORT,
                titre=de[0],
                message=f"{_haupt_name(e)}: {de[1]}",
                lien="/admin/campagnes-adhesion",
            )


def profil_erinnerung(e) -> None:
    """Erinnerung an eine angenommene Person, die Ausweis- oder Passnummer im Profil ergänzen
    sollte."""
    user = getattr(e.membre, "user", None)
    if user is None or not user.is_active:
        return
    de = (
        "Bitte ergänze dein Profil",
        "Für deine Mitgliedschaft im Familienpaket fehlt noch die Ausweisnummer (CIN) oder "
        "Passnummer. Du kannst sie in deinem Profil ergänzen.",
    )
    fr = (
        "Merci de compléter ton profil",
        "Il manque encore le numéro de pièce d'identité (CIN) ou de passeport pour ton "
        "adhésion au forfait famille. Tu peux l'ajouter dans ton profil.",
    )
    _mail(user.email, de, fr, lien="/mon-profil", cta=("Profil öffnen", "Ouvrir le profil"))


def altershinweis(souscription, kinder) -> None:
    """Hinweis an die Hauptperson : Kinder haben das Höchstalter der Kampagne überschritten.
    Sie können in der nächsten Kampagne als Erwachsene angemeldet werden. Nur Vornamen."""
    user = souscription.membre.user
    if user is None or not user.is_active:
        return
    namen = ", ".join(k.vorname for k in kinder)
    grenze = souscription.campagne.familie_max_alter_kind
    de = (
        "Hinweis zum Familienpaket",
        f"Folgende Kinder sind älter als das Höchstalter von {grenze} Jahren: {namen}. "
        "Bis zum Ende der laufenden Kampagne bleibt alles unverändert. In der nächsten "
        "Kampagne können sie als weitere Erwachsene angemeldet werden.",
    )
    fr = (
        "Information sur le forfait famille",
        f"Les enfants suivants dépassent l'âge maximum de {grenze} ans : {namen}. Jusqu'à la "
        "fin de la campagne en cours, rien ne change. À la prochaine campagne, ils pourront "
        "être inscrits comme adultes supplémentaires.",
    )
    lien = "/mon-adhesion"
    titel, text = fr if sprache(user) == "fr" else de
    notifier(user, TypeNotification.FAMILIE_ALTER, titre=titel, message=text, lien=lien)
    _mail(user.email, de, fr, lien=lien, cta=("Zur Mitgliedschaft", "Vers l'adhésion"))

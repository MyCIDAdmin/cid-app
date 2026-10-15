"""Startinhalte der häufigen Fragen (Release 33). Das Büro pflegt sie danach in der App."""

from django.db import migrations

# (Kategorie, Frage DE, Frage FR, Antwort DE, Antwort FR, aktiv)
FAQ = [
    (
        "konto",
        "Ich habe mein Passwort vergessen. Was tun?",
        "J'ai oublié mon mot de passe. Que faire ?",
        "Wähle auf der Anmeldeseite „Passwort vergessen“ und gib die E-Mail-Adresse deines "
        "Kontos ein. Du bekommst einen Link zum Zurücksetzen.\n"
        "Schau auch im Spam-Ordner nach. Kommt nach einigen Minuten nichts an, eröffne ein Ticket.",
        "Sur la page de connexion, choisis « Mot de passe oublié » et saisis l'adresse e-mail de "
        "ton compte. Tu reçois un lien pour le réinitialiser.\n"
        "Regarde aussi dans les spams. Si rien n'arrive au bout de quelques minutes, ouvre un "
        "ticket.",
        True,
    ),
    (
        "konto",
        "Ich bekomme keinen Bestätigungscode per E-Mail.",
        "Je ne reçois pas de code de confirmation par e-mail.",
        "Prüfe den Spam-Ordner und ob die E-Mail-Adresse richtig geschrieben ist.\n"
        "Fordere nach etwa einer Minute einen neuen Code an ; der vorherige gilt dann nicht "
        "mehr. Hilft das nicht, eröffne ein Ticket und nenne deine E-Mail-Adresse.",
        "Vérifie les spams et que l'adresse e-mail est bien écrite.\n"
        "Demande un nouveau code après environ une minute ; le précédent n'est alors plus "
        "valable. Si cela ne suffit pas, ouvre un ticket en indiquant ton adresse e-mail.",
        True,
    ),
    (
        "mitgliedschaft",
        "Was ist der Unterschied zwischen Mitglied und Fan?",
        "Quelle est la différence entre membre et fan ?",
        "Mitglieder gehören dem Verein an und haben Zugang zu den Mitgliederbereichen.\n"
        "Fans haben ein Konto ohne Mitgliedschaft und sehen nur einen Teil der Bereiche, etwa "
        "Regionen und Veranstaltungen. Was ein Fan sieht, legt das Büro fest.\n"
        "Fans können jederzeit Mitglied werden.",
        "Les membres appartiennent à l'association et ont accès aux espaces réservés aux "
        "membres.\n"
        "Les fans ont un compte sans adhésion et ne voient qu'une partie des rubriques, par "
        "exemple les régions et les événements. Ce que voit un fan est défini par le bureau.\n"
        "Un fan peut devenir membre à tout moment.",
        True,
    ),
    (
        "mitgliedschaft",
        "Wie werde ich Mitglied?",
        "Comment devenir membre ?",
        "Öffne „Meine Mitgliedschaft“ und wähle ein Angebot. Das Büro bestätigt deine "
        "Mitgliedschaft ; den Stand siehst du auf derselben Seite.",
        "Ouvre « Mon adhésion » et choisis une offre. Le bureau confirme ton adhésion ; tu en "
        "vois l'état sur la même page.",
        True,
    ),
    (
        "zahlung",
        "Wann ist meine Zahlung angekommen?",
        "Quand mon paiement sera-t-il enregistré ?",
        "Das Büro verbucht Zahlungen von Hand, das braucht etwas Zeit. Den Stand siehst du "
        "unter „Meine Mitgliedschaft“, nach der Verbuchung bekommst du eine Benachrichtigung.\n"
        "Fehlt die Verbuchung nach mehreren Tagen, eröffne ein Ticket mit Datum und Betrag der "
        "Zahlung.",
        "Le bureau enregistre les paiements à la main, ce qui prend un peu de temps. Tu vois "
        "l'état sous « Mon adhésion » et tu reçois une notification une fois le paiement "
        "enregistré.\n"
        "S'il manque après plusieurs jours, ouvre un ticket avec la date et le montant du "
        "paiement.",
        True,
    ),
    (
        "veranstaltung",
        "Wie melde ich mich zu einem Treffen meiner Region an?",
        "Comment m'inscrire à une rencontre de ma région ?",
        "Öffne „Regionen“, wähle deine Region und das Treffen und tippe auf „Anmelden“. "
        "Die Anmeldung kannst du dort auch wieder zurücknehmen.",
        "Ouvre « Régions », choisis ta région et la rencontre, puis appuie sur « S'inscrire ». "
        "Tu peux aussi annuler ton inscription au même endroit.",
        True,
    ),
    (
        "konto",
        "Wie ändere ich die Sprache?",
        "Comment changer la langue ?",
        "Nutze den Sprachumschalter der App (Deutsch oder Französisch). E-Mails des Vereins "
        "kommen zweisprachig.",
        "Utilise le sélecteur de langue de l'application (allemand ou français). Les e-mails "
        "de l'association sont bilingues.",
        True,
    ),
    (
        "konto",
        "Wie schalte ich die Geburtstagsmail ab?",
        "Comment désactiver le message d'anniversaire ?",
        "Öffne „Mein Profil“, dann Einstellungen und Benachrichtigungen. Dort schaltest du "
        "den Geburtstagsgruss aus.",
        "Ouvre « Mon profil », puis Paramètres et Notifications. Tu y désactives le message "
        "d'anniversaire.",
        True,
    ),
    (
        "konto",
        "Wie verbinde ich Telegram mit meinem Konto?",
        "Comment relier Telegram à mon compte ?",
        "Öffne „Mein Profil“, dann Einstellungen und Benachrichtigungen, und folge den "
        "Schritten zum Verbinden.\n"
        "Telegram bekommt nur den Titel einer Benachrichtigung und einen Link, nie den Inhalt.",
        "Ouvre « Mon profil », puis Paramètres et Notifications, et suis les étapes de "
        "connexion.\n"
        "Telegram ne reçoit que le titre d'une notification et un lien, jamais le contenu.",
        False,  # erst aktivieren, wenn Telegram im Produktivbetrieb eingeschaltet ist
    ),
    (
        "konto",
        "Wie kann ich meine Daten einsehen oder löschen lassen?",
        "Comment consulter ou faire supprimer mes données ?",
        "Deine Angaben siehst und korrigierst du in „Mein Profil“.\n"
        "Für die Löschung deines Kontos eröffne ein Ticket in der Kategorie „Konto und "
        "Anmeldung“. Das Büro prüft deine Anfrage und meldet sich bei dir.",
        "Tu consultes et corriges tes informations dans « Mon profil ».\n"
        "Pour faire supprimer ton compte, ouvre un ticket dans la catégorie « Compte et "
        "connexion ». Le bureau examine ta demande et te répond.",
        True,
    ),
    (
        "technik",
        "Etwas funktioniert nicht. Wie melde ich einen Fehler?",
        "Quelque chose ne fonctionne pas. Comment signaler une erreur ?",
        "Eröffne ein Ticket in der Kategorie „Technik und Fehler“ und beschreibe: was du "
        "tun wolltest, was du erwartet hast und was stattdessen passiert ist.\n"
        "Nenne auch Gerät und Browser. Gib keine Passwörter an.",
        "Ouvre un ticket dans la catégorie « Technique et erreurs » et décris : ce que tu "
        "voulais faire, ce que tu attendais et ce qui s'est passé à la place.\n"
        "Indique aussi l'appareil et le navigateur. Ne communique jamais de mot de passe.",
        True,
    ),
]


def seed(apps, schema_editor):
    FaqEintrag = apps.get_model("support", "FaqEintrag")
    if FaqEintrag.objects.exists():
        return
    for i, (kat, fde, ffr, ade, afr, aktiv) in enumerate(FAQ, start=1):
        FaqEintrag.objects.create(
            kategorie=kat,
            frage_de=fde,
            frage_fr=ffr,
            antwort_de=ade,
            antwort_fr=afr,
            reihenfolge=i * 10,
            aktiv=aktiv,
        )


class Migration(migrations.Migration):
    dependencies = [("support", "0001_initial")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

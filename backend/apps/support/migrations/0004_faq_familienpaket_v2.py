"""Familienpaket (Release 35) : Antworten an den neuen Ablauf anpassen (Angebote kombinieren,
Familienrabatt in %, Einladung der Erwachsenen) und neue Fragen ergänzen."""

from django.db import migrations

# (Kategorie, Frage DE, Frage FR, Antwort DE, Antwort FR) — Frage DE ist der Schlüssel.
AKTUALISIEREN = [
    (
        "Wie funktioniert das Familienpaket?",
        "Comment fonctionne le forfait famille ?",
        "Das Familienpaket kombiniert bestehende Angebote: Du, weitere Erwachsene und Kinder "
        "bekommen jeweils das Angebot, das der Verein für die Rolle festgelegt hat. Der Preis ist "
        "die Summe dieser Angebote minus Familienrabatt in Prozent.\n"
        "Bei der Anmeldung trägst du alle Personen ein (Name, Beziehung, bei Erwachsenen die "
        "E-Mail-Adresse, bei Kindern das Geburtsjahr) und siehst den Gesamtpreis sofort. Erst "
        "danach folgt die Zahlung. Ein Wechsel auf das Paket ist erst ab der nächsten Kampagne "
        "möglich.",
        "Le forfait famille combine des offres existantes : toi, les adultes supplémentaires et "
        "les enfants recevez chacun l'offre fixée par l'association pour son rôle. Le prix est la "
        "somme de ces offres moins la remise famille en pourcentage.\n"
        "Lors de l'inscription, tu saisis toutes les personnes (nom, lien, e-mail pour les "
        "adultes, année de naissance pour les enfants) et vois tout de suite le prix total. Le "
        "paiement suit ensuite. Le passage au forfait n'est possible qu'à partir de la prochaine "
        "campagne.",
    ),
    (
        "Wie trage ich mein Kind im Familienpaket ein?",
        "Comment enregistrer mon enfant dans le forfait famille ?",
        "Wähle in „Meine Mitgliedschaft“ das Familienpaket und trage das Kind ein: Vorname, "
        "Nachname, Geburtsjahr und Beziehung (Kind oder Geschwister). Du bestätigst, dass du "
        "sorgeberechtigt bist und einwilligst. Das Höchstalter legt der Verein je Kampagne fest.\n"
        "Nach der Buchung kannst du ein Kind wieder entfernen; seine Daten werden dann gelöscht.",
        "Choisis le forfait famille dans « Mon adhésion » et saisis l'enfant : prénom, nom, année "
        "de naissance et lien (enfant ou frère/sœur). Tu confirmes avoir l'autorité parentale et "
        "donnes ton consentement. L'âge maximum est fixé par l'association pour chaque campagne.\n"
        "Après la réservation, tu peux retirer un enfant ; ses données sont alors supprimées.",
    ),
    (
        "Wann bekommen die Kinder ihre Karte?",
        "Quand les enfants reçoivent-ils leur carte ?",
        "Sobald die Zahlung des Familienpakets bestätigt ist, erscheint unter „Mein "
        "Familienpaket“ für jedes eingetragene Kind eine eigene Junior-Karte mit eigener Nummer. "
        "Die Karten der Kinder siehst du bei dir, weil Kinder kein eigenes Konto haben.",
        "Dès que le paiement du forfait famille est confirmé, une carte Junior avec son propre "
        "numéro apparaît sous « Mon forfait famille » pour chaque enfant enregistré. Tu vois les "
        "cartes des enfants chez toi, car les enfants n'ont pas de compte.",
    ),
]

NEU = [
    (
        "mitgliedschaft",
        "Wie werden weitere Erwachsene ins Familienpaket aufgenommen?",
        "Comment les adultes supplémentaires rejoignent-ils le forfait famille ?",
        "Du gibst Vorname, Nachname, E-Mail-Adresse und Beziehung ein (Ehepartner, Kind, "
        "Geschwister oder Elternteil). Sobald du bezahlt hast, bekommt die Person eine "
        "Einladung per E-Mail.\n"
        "Hat sie noch kein Konto, erstellt sie eines und ergänzt ihre Daten. Hat sie schon eines, "
        "bestätigt sie die Einladung selbst – nichts wird ohne ihre Zustimmung verknüpft. Danach "
        "ist sie ein eigenes, stimmberechtigtes Mitglied mit dem zugewiesenen Angebot. Unter „Mein "
        "Familienpaket“ siehst du, wer schon angenommen hat.",
        "Tu saisis prénom, nom, adresse e-mail et lien (conjoint, enfant, frère/sœur ou parent). "
        "Dès que tu as payé, la personne reçoit une invitation par e-mail.\n"
        "Sans compte, elle en crée un et complète ses données. Avec un compte, elle confirme "
        "elle-même l'invitation – rien n'est lié sans son accord. Elle devient ensuite membre à "
        "part entière, avec droit de vote et l'offre attribuée. Sous « Mon forfait famille », tu "
        "vois qui a déjà accepté.",
    ),
    (
        "mitgliedschaft",
        "Die eingeladene Person hat die Einladung nicht erhalten. Was kann ich tun?",
        "La personne invitée n'a pas reçu l'invitation. Que faire ?",
        "Prüfe unter „Mein Familienpaket“, ob die E-Mail-Adresse stimmt, und korrigiere sie bei "
        "Bedarf – dann geht automatisch eine neue Einladung raus und der alte Link verfällt. Mit "
        "„Einladung erneut senden“ schickst du sie nach frühestens einer Stunde noch einmal. Sieh "
        "auch im Spam-Ordner nach.",
        "Vérifie sous « Mon forfait famille » que l'adresse e-mail est correcte et corrige-la si "
        "besoin : une nouvelle invitation part automatiquement et l'ancien lien expire. Avec « "
        "Renvoyer l'invitation », tu la renvoies après une heure au plus tôt. Regarde aussi dans "
        "les spams.",
    ),
    (
        "mitgliedschaft",
        "Wie wird der Familienrabatt berechnet?",
        "Comment la remise famille est-elle calculée ?",
        "Der Verein legt für das Familienpaket einen Rabatt in Prozent fest. Er gilt auf die "
        "Summe der Angebote aller Personen. Du zahlst den Gesamtbetrag einmal; jede Person "
        "bekommt ihren Anteil nach Rabatt zugerechnet.",
        "L'association fixe une remise en pourcentage pour le forfait famille. Elle s'applique à "
        "la somme des offres de toutes les personnes. Tu paies le montant total une seule fois ; "
        "la part de chaque personne est calculée après remise.",
    ),
]


def anpassen(apps, schema_editor):
    FaqEintrag = apps.get_model("support", "FaqEintrag")
    for fde, ffr, ade, afr in AKTUALISIEREN:
        eintrag = FaqEintrag.objects.filter(frage_de=fde).first()
        if eintrag is None:
            continue
        eintrag.antwort_de, eintrag.antwort_fr = ade, afr
        eintrag.save(update_fields=["antwort_de", "antwort_fr"])
    start = (
        FaqEintrag.objects.order_by("-reihenfolge").values_list("reihenfolge", flat=True).first()
        or 0
    )
    for i, (kat, fde, ffr, ade, afr) in enumerate(NEU, start=1):
        if FaqEintrag.objects.filter(frage_de=fde).exists():
            continue
        FaqEintrag.objects.create(
            kategorie=kat,
            frage_de=fde,
            frage_fr=ffr,
            antwort_de=ade,
            antwort_fr=afr,
            reihenfolge=start + i * 10,
            aktiv=True,
        )


class Migration(migrations.Migration):
    dependencies = [("support", "0003_faq_familienpaket")]
    operations = [migrations.RunPython(anpassen, migrations.RunPython.noop)]

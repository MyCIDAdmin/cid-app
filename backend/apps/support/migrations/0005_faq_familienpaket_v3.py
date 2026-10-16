"""Familienpaket (Release 36) : Übernahme aus dem Vorjahr, Höchstalter-Hinweis und Anonymisierung
statt Löschung erklären."""

from django.db import migrations

# (Kategorie, Frage DE, Frage FR, Antwort DE, Antwort FR) — Frage DE ist der Schlüssel.
AKTUALISIEREN = [
    (
        "Wie trage ich mein Kind im Familienpaket ein?",
        "Comment enregistrer mon enfant dans le forfait famille ?",
        "Wähle in „Meine Mitgliedschaft“ das Familienpaket und trage das Kind ein: Vorname, "
        "Nachname, Geburtsjahr und Beziehung (Kind oder Geschwister). Du bestätigst, dass du "
        "sorgeberechtigt bist und einwilligst. Das Höchstalter legt der Verein je Kampagne fest.\n"
        "Nach der Buchung kannst du ein Kind wieder entfernen; seine Daten werden dann gelöscht. "
        "Nach Ablauf der Aufbewahrungsfrist werden die Daten anonymisiert (siehe „Was passiert mit "
        "den Daten meiner Kinder nach der Kampagne?“).",
        "Choisis le forfait famille dans « Mon adhésion » et saisis l'enfant : prénom, nom, année "
        "de naissance et lien (enfant ou frère/sœur). Tu confirmes avoir l'autorité parentale et "
        "donnes ton consentement. L'âge maximum est fixé par l'association pour chaque campagne.\n"
        "Après la réservation, tu peux retirer un enfant ; ses données sont alors supprimées. "
        "Après le délai de conservation, les données sont anonymisées (voir « Que deviennent les "
        "données de mes enfants après la campagne ? »).",
    ),
]

NEU = [
    (
        "mitgliedschaft",
        "Wie übernehme ich meine Familie in die nächste Kampagne?",
        "Comment reprendre ma famille pour la prochaine campagne ?",
        "Buchst du wieder ein Familienpaket, erscheint bei der Erfassung der Personen der Button "
        "„Familie aus dem Vorjahr übernehmen“. Er füllt die Angaben aus deinem letzten Paket vor; "
        "du kannst alles prüfen und ändern. Für Kinder erteilst du die Einwilligung neu. Weitere "
        "Erwachsene werden nach der Zahlung wieder eingeladen.\n"
        "Kinder, die für die neue Kampagne zu alt sind, stehen dann als weitere Erwachsene da – "
        "du ergänzt ihre E-Mail-Adresse. Bereits anonymisierte Angaben können nicht übernommen "
        "werden.",
        "Si tu réserves à nouveau un forfait famille, le bouton « Reprendre la famille de l'an "
        "dernier » apparaît lors de la saisie des personnes. Il préremplit les données de ton "
        "dernier forfait ; tu peux tout vérifier et modifier. Pour les enfants, tu donnes à "
        "nouveau ton consentement. Les adultes supplémentaires sont réinvités après le paiement.\n"
        "Les enfants trop âgés pour la nouvelle campagne apparaissent comme adultes "
        "supplémentaires – tu ajoutes leur adresse e-mail. Les données déjà anonymisées ne peuvent "
        "pas être reprises.",
    ),
    (
        "mitgliedschaft",
        "Mein Kind ist älter als das Höchstalter. Was nun?",
        "Mon enfant dépasse l'âge maximum. Que faire ?",
        "Bis zum Ende der laufenden Kampagne bleibt alles unverändert, die Karte gilt weiter. "
        "Du bekommst einen Hinweis in der App und per E-Mail. In der nächsten Kampagne meldest du "
        "die Person als weitere erwachsene Person an: Sie erhält eine Einladung und wird ein "
        "eigenes Mitglied.",
        "Jusqu'à la fin de la campagne en cours, rien ne change et la carte reste valable. Tu "
        "reçois une information dans l'application et par e-mail. À la prochaine campagne, tu "
        "inscris la personne comme adulte supplémentaire : elle reçoit une invitation et devient "
        "membre à part entière.",
    ),
    (
        "mitgliedschaft",
        "Was passiert mit den Daten meiner Kinder nach der Kampagne?",
        "Que deviennent les données de mes enfants après la campagne ?",
        "Ein Jahr nach Ende der Kampagne anonymisiert die App die Angaben: Namen, E-Mail-Adressen "
        "und Kartennummern entfallen, ebenso der Bezug zu deinem Konto. Es bleiben nur Geburtsjahr, "
        "Beziehung, Angebot und Preise, damit der Verein Verlauf und Zahlen behält. Auf eine "
        "Person lässt sich daraus nicht schließen.",
        "Un an après la fin de la campagne, l'application anonymise les données : noms, adresses "
        "e-mail et numéros de carte disparaissent, tout comme le lien avec ton compte. Il ne reste "
        "que l'année de naissance, le lien, l'offre et les prix, pour que l'association conserve "
        "l'historique et les chiffres. Aucune personne ne peut en être identifiée.",
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
    dependencies = [("support", "0004_faq_familienpaket_v2")]
    operations = [migrations.RunPython(anpassen, migrations.RunPython.noop)]

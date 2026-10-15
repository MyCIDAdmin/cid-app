"""Häufige Fragen zum Familienpaket (Release 34). Das Büro pflegt sie danach in der App."""

from django.db import migrations

# (Kategorie, Frage DE, Frage FR, Antwort DE, Antwort FR)
FAQ = [
    (
        "mitgliedschaft",
        "Wie funktioniert das Familienpaket?",
        "Comment fonctionne le forfait famille ?",
        "Das Familienpaket besteht aus einem Grundpreis und einem Zuschlag für jede weitere Person. "
        "Bei der Anmeldung wählst du, wie viele weitere Erwachsene und wie viele Kinder dazukommen, "
        "und siehst den Gesamtpreis sofort.\n"
        "Für Kinder (unter 18 Jahren) bekommst du je Kind eine eigene Junior-Karte. Ein Wechsel auf "
        "das Paket ist erst ab der nächsten Kampagne möglich.",
        "Le forfait famille se compose d'un prix de base et d'un supplément pour chaque personne "
        "supplémentaire. Lors de l'inscription, tu choisis combien d'adultes et d'enfants "
        "s'ajoutent et tu vois tout de suite le prix total.\n"
        "Pour les enfants (moins de 18 ans), tu reçois une carte Junior par enfant. Le passage au "
        "forfait n'est possible qu'à partir de la prochaine campagne.",
    ),
    (
        "mitgliedschaft",
        "Wie trage ich mein Kind im Familienpaket ein?",
        "Comment enregistrer mon enfant dans le forfait famille ?",
        "Öffne „Meine Mitgliedschaft“. Im Bereich „Mein Familienpaket“ gibst du Vorname, Nachname "
        "und Geburtsjahr des Kindes ein und bestätigst, dass du sorgeberechtigt bist und einwilligst.\n"
        "Du kannst nur so viele Kinder eintragen, wie du gebucht hast. Ein Kind kannst du jederzeit "
        "wieder entfernen ; seine Daten werden dann gelöscht.",
        "Ouvre « Mon adhésion ». Dans la zone « Mon forfait famille », saisis le prénom, le nom et "
        "l'année de naissance de l'enfant, puis confirme que tu as l'autorité parentale et que tu "
        "donnes ton consentement.\n"
        "Tu ne peux enregistrer que le nombre d'enfants réservé. Tu peux retirer un enfant à tout "
        "moment ; ses données sont alors supprimées.",
    ),
    (
        "mitgliedschaft",
        "Wann bekommen die Kinder ihre Karte?",
        "Quand les enfants reçoivent-ils leur carte ?",
        "Sobald die Zahlung des Familienpakets bestätigt ist, erscheint unter „Mein Familienpaket“ "
        "für jedes eingetragene Kind eine eigene Junior-Karte mit eigener Nummer.\n"
        "Trägst du ein Kind später ein, erscheint die Karte sofort, wenn das Paket schon bezahlt ist.",
        "Dès que le paiement du forfait famille est confirmé, une carte Junior avec son propre "
        "numéro apparaît sous « Mon forfait famille » pour chaque enfant enregistré.\n"
        "Si tu enregistres un enfant plus tard, la carte apparaît tout de suite lorsque le forfait "
        "est déjà payé.",
    ),
]


def seed(apps, schema_editor):
    FaqEintrag = apps.get_model("support", "FaqEintrag")
    start = (
        FaqEintrag.objects.order_by("-reihenfolge").values_list("reihenfolge", flat=True).first()
        or 0
    )
    for i, (kat, fde, ffr, ade, afr) in enumerate(FAQ, start=1):
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
    dependencies = [("support", "0002_faq_startinhalte")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

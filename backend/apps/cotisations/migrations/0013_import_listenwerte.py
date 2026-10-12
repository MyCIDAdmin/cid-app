import uuid

import django.db.models.functions.text
from django.db import migrations, models

STANDARD = [
    ("zahlungsart", "Überweisung", "virement_sepa", 1),
    ("zahlungsart", "PayPal", "paypal", 2),
    ("zahlungsart", "Bar", "especes", 3),
    ("zahlungsart", "Karte", "carte", 4),
    ("verwendungszweck", "Mitgliedsbeitrag", "", 1),
    ("verwendungszweck", "Aufnahmegebühr", "", 2),
    ("verwendungszweck", "Spende", "", 3),
    ("verwendungszweck", "Veranstaltung", "", 4),
    ("verwendungszweck", "Sonstiges", "", 5),
]


def standardwerte(apps, schema_editor):
    modell = apps.get_model("cotisations", "ImportListenWert")
    for liste, bezeichnung, modus, ordnung in STANDARD:
        modell.objects.get_or_create(
            liste=liste,
            bezeichnung=bezeichnung,
            defaults={"modus": modus, "reihenfolge": ordnung},
        )


class Migration(migrations.Migration):

    dependencies = [("cotisations", "0012_zahlungseingaenge")]

    operations = [
        migrations.CreateModel(
            name="ImportListenWert",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("liste", models.CharField(choices=[("zahlungsart", "Zahlungsart"), ("verwendungszweck", "Verwendungszweck")], max_length=20)),
                ("bezeichnung", models.CharField(max_length=100)),
                ("modus", models.CharField(blank=True, choices=[("carte", "Carte bancaire"), ("virement_sepa", "Virement SEPA"), ("paypal", "PayPal"), ("especes", "Espèces")], max_length=20)),
                ("aktiv", models.BooleanField(default=True)),
                ("reihenfolge", models.PositiveSmallIntegerField(default=0)),
            ],
            options={
                "verbose_name": "Listenwert Zahlungsimport",
                "verbose_name_plural": "Listenwerte Zahlungsimport",
                "db_table": "cotisations_import_listenwerte",
                "ordering": ["liste", "reihenfolge", "bezeichnung"],
            },
        ),
        migrations.AddConstraint(
            model_name="importlistenwert",
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower("bezeichnung"),
                models.F("liste"),
                name="uniq_import_listenwert_liste_bezeichnung",
            ),
        ),
        migrations.RunPython(standardwerte, migrations.RunPython.noop),
    ]

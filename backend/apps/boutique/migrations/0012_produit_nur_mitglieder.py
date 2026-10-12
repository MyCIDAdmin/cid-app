from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("boutique", "0011_variantenpreise_zahlungsfrist"),
    ]

    operations = [
        migrations.AddField(
            model_name="produit",
            name="nur_mitglieder",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Exklusiv für Mitglieder : sichtbar für alle, aber nur aktive Mitglieder "
                    "dürfen bestellen oder reservieren (serverseitig geprüft)."
                ),
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("adhesions", "0006_planifier_bascule_non_renouveles")]

    operations = [
        migrations.AddField(
            model_name="offreadhesion",
            name="kartenstil",
            field=models.CharField(
                blank=True,
                choices=[
                    ("weiss", "Weiß"),
                    ("silber", "Silber"),
                    ("gold", "Gold"),
                    ("diamant", "Diamant"),
                    ("bronze", "Bronze"),
                    ("onyx", "Onyx"),
                    ("rubin", "Rubin (CID-Rot)"),
                ],
                help_text="Look de la carte de membre numérique pour ce niveau. Vide = Rubin.",
                max_length=10,
            ),
        ),
    ]

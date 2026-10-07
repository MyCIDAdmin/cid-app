from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("membres", "0007_frist_renouvellement"),
    ]

    operations = [
        migrations.AddField(
            model_name="membre",
            name="rapprochement_ecarte",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "RH/Admin a confirmé qu'aucune fiche importée ne correspond à ce compte "
                    "— exclu de la liste de rapprochement."
                ),
            ),
        ),
    ]

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communaute", "0020_rencontre_corrections_manuelles"),
        ("projets", "0009_stellen_bewerbungen"),
    ]

    operations = [
        migrations.AddField(
            model_name="album",
            name="oeffentlich",
            field=models.BooleanField(
                default=False, verbose_name="Auf der öffentlichen Startseite zeigen"
            ),
        ),
        migrations.AddField(
            model_name="album",
            name="projet",
            field=models.ForeignKey(
                blank=True,
                help_text="Optional — Album gehört zu einem Projekt bzw. einer Aktion.",
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="albums",
                to="projets.projet",
            ),
        ),
    ]

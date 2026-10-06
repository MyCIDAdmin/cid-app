import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("projets", "0002_sichtbarkeit_team_aufgaben"),
        ("finances", "0002_protokoll_jahresabschluss"),
    ]

    operations = [
        migrations.AddField(
            model_name="depense",
            name="aufgabe",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="depenses",
                to="projets.aufgabe",
            ),
        ),
    ]

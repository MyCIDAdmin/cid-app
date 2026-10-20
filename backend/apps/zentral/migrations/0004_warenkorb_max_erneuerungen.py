import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("zentral", "0003_hinweis_schwellen"),
    ]

    operations = [
        migrations.AddField(
            model_name="zentraleeinstellungen",
            name="warenkorb_max_erneuerungen",
            field=models.PositiveSmallIntegerField(
                default=2,
                help_text=(
                    "Wie oft eine abgelaufene Reservierung per „Erneut reservieren“ verlängert "
                    "werden darf. Läuft sie danach noch einmal ab, wird der Warenkorb geleert "
                    "(0 = sofort)."
                ),
                validators=[django.core.validators.MaxValueValidator(10)],
                verbose_name="Warenkorb: erneute Reservierungen",
            ),
        ),
    ]

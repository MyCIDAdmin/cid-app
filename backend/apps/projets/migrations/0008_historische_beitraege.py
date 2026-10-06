import decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("projets", "0007_planjahr")]

    operations = [
        migrations.AddField(
            model_name="projet",
            name="historisch_betrag",
            field=models.DecimalField(
                decimal_places=2,
                default=decimal.Decimal("0.00"),
                max_digits=10,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal("0.00"))],
                verbose_name="Manuell erfasster Beitrag (Historie)",
            ),
        ),
        migrations.AddField(
            model_name="projet",
            name="historisch_beitragende",
            field=models.PositiveIntegerField(
                default=0, verbose_name="Anzahl Beitragende (Historie)"
            ),
        ),
        migrations.AddField(
            model_name="projet",
            name="historisch_jahr",
            field=models.PositiveSmallIntegerField(
                blank=True, null=True, verbose_name="Jahr des historischen Beitrags"
            ),
        ),
    ]

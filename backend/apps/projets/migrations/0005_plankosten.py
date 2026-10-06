import uuid

import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("finances", "0002_protokoll_jahresabschluss"),
        ("projets", "0004_planifier_erinnerung_fristen"),
    ]

    operations = [
        migrations.CreateModel(
            name="PlanKosten",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "betrag",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=10,
                        validators=[django.core.validators.MinValueValidator(Decimal("0.00"))],
                    ),
                ),
                ("notiz", models.CharField(blank=True, max_length=200)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "categorie",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="+",
                        to="finances.categoriedepense",
                    ),
                ),
                (
                    "projet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="plankosten",
                        to="projets.projet",
                    ),
                ),
            ],
            options={
                "verbose_name": "Coût prévu",
                "verbose_name_plural": "Coûts prévus",
                "db_table": "projets_plankosten",
                "ordering": ["categorie__ordre", "categorie__nom"],
            },
        ),
        migrations.AddConstraint(
            model_name="plankosten",
            constraint=models.UniqueConstraint(
                fields=("projet", "categorie"), name="projets_plankosten_unique_categorie"
            ),
        ),
    ]

import uuid
from decimal import Decimal

import django.core.validators
from django.db import migrations, models


def projektkategorie_anlegen(apps, schema_editor):
    """Legt die Kategorie „Projekte“ an (Topf für die Plan-Kosten aller Projekte eines Jahres)."""
    Kategorie = apps.get_model("finances", "CategorieDepense")
    if Kategorie.objects.filter(projektbudget=True).exists():
        return
    kat = Kategorie.objects.filter(nom="Projets").first()
    if kat is None:
        ordre = (Kategorie.objects.order_by("-ordre").values_list("ordre", flat=True).first() or 0) + 1
        kat = Kategorie(nom="Projets", ordre=ordre)
    kat.nom_de = kat.nom_de or "Projekte"
    kat.nom_ar = kat.nom_ar or "المشاريع"
    kat.projektbudget = True
    kat.actif = True
    kat.save()


class Migration(migrations.Migration):
    dependencies = [("finances", "0004_categorie_uebersetzungen")]

    operations = [
        migrations.AddField(
            model_name="categoriedepense",
            name="projektbudget",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="Gesamtbudget",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("annee", models.PositiveSmallIntegerField(unique=True)),
                (
                    "montant",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=12,
                        validators=[django.core.validators.MinValueValidator(Decimal("0.00"))],
                    ),
                ),
            ],
            options={"ordering": ["annee"]},
        ),
        migrations.RunPython(projektkategorie_anlegen, migrations.RunPython.noop),
    ]

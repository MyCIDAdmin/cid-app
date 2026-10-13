from django.db import migrations

from apps.membres.faehigkeiten import STANDARD_KATALOG


def seed(apps, schema_editor):
    Faehigkeit = apps.get_model("membres", "Faehigkeit")
    for kategorie, namen in STANDARD_KATALOG.items():
        for name in namen:
            if not Faehigkeit.objects.filter(bezeichnung__iexact=name).exists():
                Faehigkeit.objects.create(
                    bezeichnung=name, kategorie=str(kategorie.value), ist_standard=True
                )


class Migration(migrations.Migration):
    dependencies = [
        ("membres", "0009_faehigkeiten"),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]

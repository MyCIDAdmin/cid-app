from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("regionen", "0008_planen_erinnerung"),
    ]

    operations = [
        migrations.AddField(
            model_name="veranstaltung",
            name="ort_maps_url",
            field=models.URLField(blank=True, max_length=500),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("communaute", "0018_kacheln_hero"),
    ]

    operations = [
        migrations.AddField(
            model_name="configurationsitepublic",
            name="kachel1_lien_text",
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.AddField(
            model_name="configurationsitepublic",
            name="kachel2_lien_text",
            field=models.CharField(blank=True, max_length=80),
        ),
    ]

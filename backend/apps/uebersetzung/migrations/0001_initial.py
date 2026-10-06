import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.CreateModel(
            name="Uebersetzung",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name="ID"
                    ),
                ),
                ("objekt_id", models.CharField(max_length=64)),
                ("feld", models.CharField(max_length=50)),
                ("sprache", models.CharField(max_length=2)),
                ("text", models.TextField(blank=True)),
                ("quell_hash", models.CharField(max_length=64)),
                ("automatisch", models.BooleanField(default=True)),
                ("aktualisiert", models.DateTimeField(auto_now=True)),
                (
                    "content_type",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, to="contenttypes.contenttype"
                    ),
                ),
            ],
            options={
                "db_table": "uebersetzung_uebersetzung",
            },
        ),
        migrations.AddConstraint(
            model_name="uebersetzung",
            constraint=models.UniqueConstraint(
                fields=("content_type", "objekt_id", "feld", "sprache"),
                name="uebersetzung_eindeutig",
            ),
        ),
        migrations.AddIndex(
            model_name="uebersetzung",
            index=models.Index(
                fields=["content_type", "objekt_id"], name="uebersetzung_objekt_idx"
            ),
        ),
    ]

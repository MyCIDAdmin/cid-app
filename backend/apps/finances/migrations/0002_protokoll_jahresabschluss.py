import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("finances", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="FinanzProtokoll",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("zeitpunkt", models.DateTimeField(auto_now_add=True)),
                ("benutzer_name", models.CharField(max_length=200)),
                ("aktion", models.CharField(choices=[("erstellt", "Erstellt"), ("geaendert", "Geändert"), ("geloescht", "Gelöscht"), ("freigegeben", "Freigegeben"), ("abgelehnt", "Abgelehnt"), ("budget", "Budget gesetzt"), ("abgeschlossen", "Jahr abgeschlossen"), ("wiedergeoeffnet", "Jahr wiedereröffnet")], max_length=20)),
                ("objekt_typ", models.CharField(max_length=20)),
                ("objekt_id", models.CharField(blank=True, max_length=64)),
                ("annee", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("zusammenfassung", models.CharField(max_length=300)),
                ("aenderungen", models.JSONField(blank=True, default=dict)),
                ("benutzer", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-zeitpunkt"]},
        ),
        migrations.AddIndex(
            model_name="finanzprotokoll",
            index=models.Index(fields=["annee", "zeitpunkt"], name="finances_prot_annee_idx"),
        ),
        migrations.CreateModel(
            name="Jahresabschluss",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("annee", models.PositiveSmallIntegerField(unique=True)),
                ("aktiv", models.BooleanField(default=True)),
                ("abgeschlossen_am", models.DateTimeField()),
                ("snapshot", models.JSONField(default=dict)),
                ("wiedergeoeffnet_am", models.DateTimeField(blank=True, null=True)),
                ("wiedereroeffnung_grund", models.TextField(blank=True)),
                ("abgeschlossen_durch", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("wiedergeoeffnet_durch", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-annee"]},
        ),
    ]

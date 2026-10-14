"""Release 22 : Tabelle der Auffälligkeiten und 10-Minuten-Prüfung."""

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models

TASK_NAME = "aktivitaet.auffaelligkeiten"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="*/10",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.aktivitaet.tasks.auffaelligkeiten_pruefen",
            "crontab": schedule,
            "enabled": True,
            "description": "Release 22 — Auffälligkeitsregeln des Aktivitäts-Protokolls.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("aktivitaet", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Auffaelligkeit",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("regel", models.CharField(max_length=40)),
                ("schluessel", models.CharField(max_length=120)),
                ("gewicht", models.CharField(default="warnung", max_length=10)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("details", models.JSONField(blank=True, default=dict)),
                (
                    "erkannt_am",
                    models.DateTimeField(db_index=True, default=django.utils.timezone.now),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[("offen", "Offen"), ("erledigt", "Erledigt")],
                        default="offen",
                        max_length=10,
                    ),
                ),
                ("erledigt_am", models.DateTimeField(blank=True, null=True)),
                (
                    "erledigt_von",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-erkannt_am"]},
        ),
        migrations.AddConstraint(
            model_name="auffaelligkeit",
            constraint=models.UniqueConstraint(
                fields=("regel", "schluessel"), name="aktivitaet_regel_schluessel"
            ),
        ),
        migrations.RunPython(planen, entplanen),
    ]

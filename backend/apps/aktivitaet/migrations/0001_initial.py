"""Release 20 : täglicher Aufbewahrungs-Job des Aktivitäts-Protokolls (03:30 Berlin)."""

from django.db import migrations

TASK_NAME = "aktivitaet.bereinigen"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.aktivitaet.tasks.aktivitaet_bereinigen",
            "crontab": schedule,
            "enabled": True,
            "description": "Release 20 — Aufbewahrungsfristen des Aktivitäts-Protokolls.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [("django_celery_beat", "0019_alter_periodictasks_options")]
    operations = [migrations.RunPython(planen, entplanen)]

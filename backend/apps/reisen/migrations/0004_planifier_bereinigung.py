"""Plant die Bereinigung persönlicher Reisedaten täglich um 03:40 (django-celery-beat).
Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "reisen.bereinige_reisedaten"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="40",
        hour="3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.reisen.tasks.bereinige_reisedaten_task",
            "crontab": schedule,
            "enabled": True,
            "description": "Löscht persönliche Reisedaten 90 Tage nach Reiseende.",
        },
    )


def entfernen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("reisen", "0003_welle2"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entfernen)]

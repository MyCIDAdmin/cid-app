"""Data migration — plant den täglichen Geburtstagsgruß (8:00 Europe/Berlin) in django-celery-beat
ein ; gleiches Prinzip wie apps.regionen.migrations.0008. Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "notifications.sende_geburtstagsgruesse"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.notifications.tasks.sende_geburtstagsgruesse",
            "crontab": schedule,
            "enabled": True,
            "description": "Geburtstagsgruß (DE/FR/AR) an aktive Mitglieder.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("notifications", "0016_r32_telegram_geburtstag"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entplanen)]

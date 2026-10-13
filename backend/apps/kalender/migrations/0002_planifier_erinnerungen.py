"""Plant die Termin-Erinnerungen (alle 30 Minuten) in django-celery-beat ein — idempotent."""

from django.db import migrations

TASK_NAME = "kalender.termin_erinnerungen"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="*/30",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.kalender.tasks.termin_erinnerungen",
            "crontab": schedule,
            "enabled": True,
            "description": "Release 15 — Erinnerungen an Kalendertermine.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kalender", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [migrations.RunPython(planen, entplanen)]

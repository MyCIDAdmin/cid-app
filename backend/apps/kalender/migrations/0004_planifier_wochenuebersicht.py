"""Plant die Wochenübersicht per E-Mail (montags 07:00 Berlin) in django-celery-beat ein."""

from django.db import migrations

TASK_NAME = "kalender.wochenuebersicht"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="7",
        day_of_week="1",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.kalender.tasks.wochenuebersicht",
            "crontab": schedule,
            "enabled": True,
            "description": "Release 17 — Wochenübersicht per E-Mail (Opt-in).",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kalender", "0003_r16_dienste_kreise"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [migrations.RunPython(planen, entplanen)]

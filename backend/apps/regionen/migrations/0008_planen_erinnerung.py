"""Data migration — plant die tägliche Erinnerung an regionale Treffen (9:00 Europe/Berlin) in
django-celery-beat ein ; gleiches Prinzip wie apps.partenaires.migrations.0003. Idempotent und
umkehrbar."""

from django.db import migrations

TASK_NAME = "regionen.erinnere_teilnehmer"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="9",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.regionen.tasks.erinnere_teilnehmer",
            "crontab": schedule,
            "enabled": True,
            "description": "Regionen — Erinnerung (DE/FR) am Vortag eines Treffens.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("regionen", "0007_r31_erinnerung"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entplanen)]

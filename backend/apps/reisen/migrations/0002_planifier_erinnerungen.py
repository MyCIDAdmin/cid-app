"""Plant die Fristerinnerungen an Entscheidungen alle 30 Minuten (django-celery-beat).
Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "reisen.erinnere_entscheidungen"


def planen(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = IntervalSchedule.objects.get_or_create(every=30, period="minutes")
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.reisen.tasks.erinnere_entscheidungen_task",
            "interval": schedule,
            "enabled": True,
            "description": "Erinnerung an offene Reise-Entscheidungen kurz vor Fristende.",
        },
    )


def entfernen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("reisen", "0001_reisen"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entfernen)]

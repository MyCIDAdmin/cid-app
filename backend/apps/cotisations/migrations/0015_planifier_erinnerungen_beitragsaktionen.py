"""Plant die täglichen Erinnerungen an Beitragsaktionen in django-celery-beat (9:30 Uhr, nach den
Beitragsrelancen um 9:00). Idempotent (get_or_create), umkehrbar. Ohne Aktion mit eingeschalteten
Erinnerungen tut die Aufgabe nichts."""

from django.db import migrations

TASK_NAME = "cotisations.erinnere_beitragsaktionen"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="9",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.cotisations.tasks.erinnere_beitragsaktionen_task",
            "crontab": schedule,
            "enabled": True,
            "description": "Erinnerungen an Beitragsaktionen (Frist bald, Ziel fast erreicht).",
        },
    )


def entfernen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("cotisations", "0014_beitragsaktionen"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entfernen)]

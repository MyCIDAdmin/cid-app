"""Plant die Fristenverarbeitung der Veranstaltungen (alle 15 Minuten) in django-celery-beat:
Erinnerung 24 h vor Ablauf, Stornierung unbezahlter Anmeldungen, Nachrücken der Warteliste.
Gleiches Muster wie 0002 — idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "evenements.fristen_verarbeiten"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="*/15",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.evenements.tasks.fristen_verarbeiten",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "Zahlungsfrist Veranstaltungen: Erinnerung 24 h vorher, unbezahlte Anmeldungen "
                "stornieren, Warteliste nachrücken lassen (siehe services.py / tasks.py)."
            ),
        },
    )


def entplanen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("evenements", "0011_zahlungsfrist_warteliste"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entplanen)]

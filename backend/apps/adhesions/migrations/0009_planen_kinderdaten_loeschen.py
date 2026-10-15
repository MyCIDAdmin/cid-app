"""Plant die tägliche Löschung abgelaufener Kinderdaten (Release 34) in django-celery-beat.
Idempotent und umkehrbar, gleiches Muster wie 0006."""

from django.db import migrations

TASK_NAME = "adhesions.loeschen_kinderdaten"


def anlegen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    zeit, _ = CrontabSchedule.objects.get_or_create(
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
            "task": "apps.adhesions.tasks.loeschen_kinderdaten",
            "crontab": zeit,
            "enabled": True,
            "description": "Löscht Kinderdaten von Familienpaketen nach Ablauf der Aufbewahrungsfrist.",
        },
    )


def entfernen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("adhesions", "0008_familienpaket"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [migrations.RunPython(anlegen, entfernen)]

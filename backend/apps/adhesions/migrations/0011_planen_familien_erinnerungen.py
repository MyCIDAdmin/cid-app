"""Plant die tägliche Prüfung der Familienpaket-Erinnerungen (Release 35) in django-celery-beat.
Idempotent und umkehrbar, gleiches Muster wie 0009."""

from django.db import migrations

TASK_NAME = "adhesions.sende_familien_erinnerungen"


def anlegen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    zeit, _ = CrontabSchedule.objects.get_or_create(
        minute="20",
        hour="9",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.adhesions.tasks.sende_familien_erinnerungen",
            "crontab": zeit,
            "enabled": True,
            "description": "Erinnerungen für offene Einladungen im Familienpaket.",
        },
    )


def entfernen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("adhesions", "0010_familienpaket_v2"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [migrations.RunPython(anlegen, entfernen)]

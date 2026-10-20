"""Plant das Aufräumen abgelaufener Warenkorb-Reservierungen (alle 5 Minuten) in django-celery-
beat — gleiches Muster wie evenements.0010. Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "boutique.panier_reservierungen_freigeben"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="*/5",
        hour="*",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.boutique.tasks.panier_reservierungen_freigeben",
            "crontab": schedule,
            "enabled": True,
            "description": "Löscht abgelaufene Warenkorb-Reservierungen (Aufräumen, siehe panier.py).",
        },
    )


def entplanen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("boutique", "0013_panier_reservierung"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entplanen)]

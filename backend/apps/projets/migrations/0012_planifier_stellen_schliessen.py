"""
Data migration — plant das tägliche Schließen abgelaufener Hilfegesuche (Nov. 2026) in
django-celery-beat, idempotent wie 0004.
"""
from django.db import migrations

TASK_NAME = "projets.schliesse_abgelaufene_stellen"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="0",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.projets.tasks.schliesse_abgelaufene_stellen",
            "crontab": schedule,
            "enabled": True,
            "description": "Schließt freie Hilfegesuche nach Ablauf der Frist.",
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("projets", "0011_hilfe_gesucht"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(creer_planification, supprimer_planification)]

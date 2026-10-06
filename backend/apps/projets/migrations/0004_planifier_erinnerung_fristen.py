"""
Data migration — planifie le rappel quotidien des tâches de projet dues (2026-10-06) dans
django-celery-beat (DatabaseScheduler), même principe que apps.cotisations 0003 : idempotent
(get_or_create) et réversible (seule la planification est supprimée).
"""
from django.db import migrations

TASK_NAME = "projets.erinnere_aufgaben_faellig"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.projets.tasks.erinnere_aufgaben_faellig",
            "crontab": schedule,
            "enabled": True,
            "description": "Rappel aux responsables des tâches de projet dues aujourd'hui/demain.",
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("projets", "0003_sichtbarkeit_team_daten"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(creer_planification, supprimer_planification)]

"""
Data migration — planifie le rappel événements J-3/J-1 (Phase 2B, RICEFW W-005) dans
django-celery-beat, même principe que apps.cotisations.migrations.0003_planifier_relance_cotisation
(voir son docstring pour le détail du fonctionnement de DatabaseScheduler).

Idempotent (get_or_create) et réversible (la tâche Celery elle-même, tasks.py, n'est pas affectée
par le retrait de sa planification).
"""
from django.db import migrations

TASK_NAME = "evenements.envoyer_rappels_evenements"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # W-005 : "Celery Beat — chaque jour 10h00" (CELERY_TIMEZONE=Europe/Berlin, appliqué par le
    # CrontabSchedule lui-même, voir config/settings/base.py).
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="10",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.evenements.tasks.envoyer_rappels_evenements",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "RICEFW W-005 — rappel email + notification in-app des inscrits à un "
                "événement publié dans exactement 3 ou 1 jour(s) (voir tasks.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("evenements", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

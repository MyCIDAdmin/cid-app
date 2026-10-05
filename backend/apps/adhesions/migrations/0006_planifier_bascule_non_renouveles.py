"""
Planifie la bascule quotidienne des membres non renouvelés (demande utilisateur du 2026-10-06,
point 3) dans django-celery-beat — même principe que
apps.evenements.migrations.0002_planifier_rappels_evenements. Idempotent et réversible.
"""

from django.db import migrations

TASK_NAME = "adhesions.basculer_membres_non_renouveles"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="15",
        hour="3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.adhesions.tasks.basculer_membres_non_renouveles",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "Membres de la campagne précédente non renouvelés après la Frist de la "
                "nouvelle campagne -> non-membres (historique conservé, voir tasks.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("adhesions", "0005_frist_renouvellement"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

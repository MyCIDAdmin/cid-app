"""
Data migration — planifie le pipeline de relance (AHM-18, RICEFW W-001) dans django-celery-beat
(DatabaseScheduler, voir CELERY_BEAT_SCHEDULER dans config/settings/base.py). Django Celery Beat
lit ses horaires en base (Periodic Tasks), pas dans un dict CELERY_BEAT_SCHEDULE statique — cette
migration crée la planification une fois pour toutes les environnements (dev, prod, Railway)
plutôt que de compter sur une configuration manuelle via l'admin Django après déploiement.

Idempotent (get_or_create) : rejouer cette migration ne duplique rien. Réversible : la tâche
planifiée est supprimée, la tâche Celery elle-même (tasks.py) n'est pas affectée.
"""
from django.db import migrations

TASK_NAME = "cotisations.envoyer_relances_cotisation"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # W-001 : "Celery Beat — chaque jour 9h00". CELERY_TIMEZONE=Europe/Berlin (config/settings/
    # base.py) ; django-celery-beat applique le fuseau horaire du CrontabSchedule lui-même.
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="9",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.cotisations.tasks.envoyer_relances_cotisation",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "AHM-18/RICEFW W-001 — relance email des membres actifs sans cotisation "
                "payée pour l'année N (checkpoints J-30/J-7/J+1, voir tasks.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("cotisations", "0002_relance_cotisation"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

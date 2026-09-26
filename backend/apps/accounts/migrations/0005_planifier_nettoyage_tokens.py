"""
Data migration — planifie le nettoyage nocturne des tokens JWT/OTP expirés (W-009) dans
django-celery-beat, même principe que apps.cotisations.migrations.0003_planifier_relance_cotisation
(voir son docstring pour le détail du fonctionnement de DatabaseScheduler).

La tâche elle-même (apps.accounts.tasks.cleanup_expired_tokens) existait déjà mais n'était pas
planifiée dans Celery Beat (relevé lors du merge de design MyCID, 2026-09-26 — voir rapport de
comparaison, section "Unter der Haube" : "Code vorhanden, noch nicht in Celery Beat eingeplant").

Idempotent (get_or_create) et réversible (la tâche Celery elle-même, tasks.py, n'est pas affectée
par le retrait de sa planification).
"""
from django.db import migrations

TASK_NAME = "accounts.cleanup_expired_tokens"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # W-009 : "Celery Beat — chaque jour 2h00" (CELERY_TIMEZONE=Europe/Berlin, appliqué par le
    # CrontabSchedule lui-même, voir config/settings/base.py) — voir aussi le docstring de
    # cleanup_expired_tokens dans apps/accounts/tasks.py.
    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="2",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.accounts.tasks.cleanup_expired_tokens",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "W-009 — nettoyage nocturne des tokens JWT blacklistés expirés et des OTP "
                "email résiduels (voir tasks.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_devicesession"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

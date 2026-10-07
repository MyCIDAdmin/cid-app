"""Data migration — plant die tägliche Partner-Erinnerung (Vertragsende, Bewertung) in
django-celery-beat ein (9:00 Europe/Berlin), gleiches Prinzip wie
apps.evenements.migrations.0002. Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "partenaires.erinnere_partner"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
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
            "task": "apps.partenaires.tasks.erinnere_partner",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "Business Partner — Erinnerung an Vertragsende (60/14 Tage) und an die "
                "Bewertung nach Ende von Veranstaltung/Projekt (siehe tasks.py)."
            ),
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("partenaires", "0002_ausbau_kontakte_logo_dokumente_angebote"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entplanen)]

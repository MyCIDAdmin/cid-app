"""Release 19 : Erinnerungs-Felder der Terminfindung + täglicher Erinnerungs-Task (08:00 Berlin)."""

from django.db import migrations, models

TASK_NAME = "kalender.umfrage_erinnerungen"


def planen(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
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
            "task": "apps.kalender.tasks.umfrage_erinnerungen",
            "crontab": schedule,
            "enabled": True,
            "description": "Release 19 — Erinnerungen und Fristmeldung der Terminfindung.",
        },
    )


def entplanen(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("kalender", "0006_r18_sitzung_terminfindung"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]
    operations = [
        migrations.AddField(
            model_name="terminumfrage",
            name="erinnert_am",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="terminumfrage",
            name="frist_gemeldet",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(planen, entplanen),
    ]

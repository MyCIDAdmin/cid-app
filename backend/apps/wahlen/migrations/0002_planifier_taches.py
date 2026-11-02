"""Data migration — plant die Celery-Beat-Aufgaben des Wahlen-Moduls (django-celery-beat,
DatabaseScheduler), gleiches Prinzip wie apps.vote.migrations.0002.

* Bekanntmachungen versenden (alle 10 Minuten)
* Nachweise nach Ablauf der Aufbewahrungsfrist löschen (täglich, 03:15 UTC)

Idempotent (get_or_create) und umkehrbar."""
from django.db import migrations

TASKS = [
    {
        "name": "wahlen.bekanntmachungen_senden",
        "task": "apps.wahlen.tasks.bekanntmachungen_senden",
        "interval": (10, "minutes"),
        "description": "Wahlen — versendet freigegebene Bekanntmachungen zum geplanten Zeitpunkt.",
    },
    {
        "name": "wahlen.nachweise_loeschen",
        "task": "apps.wahlen.tasks.nachweise_loeschen",
        "crontab": {"minute": "15", "hour": "3"},
        "description": "Wahlen — löscht Nachweise/Fotos nach Ablauf der Aufbewahrungsfrist.",
    },
]


def anlegen(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    for t in TASKS:
        defaults = {"task": t["task"], "enabled": True, "description": t["description"]}
        if "interval" in t:
            every, period = t["interval"]
            defaults["interval"], _ = IntervalSchedule.objects.get_or_create(every=every, period=period)
        else:
            defaults["crontab"], _ = CrontabSchedule.objects.get_or_create(
                minute=t["crontab"]["minute"],
                hour=t["crontab"]["hour"],
                day_of_week="*",
                day_of_month="*",
                month_of_year="*",
            )
        PeriodicTask.objects.get_or_create(name=t["name"], defaults=defaults)


def entfernen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name__in=[t["name"] for t in TASKS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("wahlen", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(anlegen, entfernen)]

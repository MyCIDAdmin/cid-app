"""Ländersteckbriefe (Nov. 2026): vorhandene Steckbriefe bekommen ihren ISO-Code, und das tägliche
Anlegen fehlender Steckbriefe für Reiseländer wird um 03:50 geplant (django-celery-beat).
Idempotent und umkehrbar."""

from django.db import migrations

TASK_NAME = "reisen.ergaenze_laenderprofile"


def planen(apps, schema_editor):
    from apps.reisen.laender_auto import finde_iso

    Laenderprofil = apps.get_model("reisen", "Laenderprofil")
    for profil in Laenderprofil.objects.filter(iso_code=""):
        iso = finde_iso(profil.land)
        if iso and not Laenderprofil.objects.filter(iso_code=iso).exists():
            profil.iso_code = iso
            profil.save(update_fields=["iso_code"])

    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="50",
        hour="3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.reisen.tasks.ergaenze_laenderprofile_task",
            "crontab": schedule,
            "enabled": True,
            "description": "Legt fehlende Ländersteckbriefe für Reiseländer automatisch an.",
        },
    )


def entfernen(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("reisen", "0006_laenderprofil_iso"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(planen, entfernen)]

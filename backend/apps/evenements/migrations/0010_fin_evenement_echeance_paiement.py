"""Fin d'événement optionnelle, échéance de paiement + planification du rappel de paiement
(demande utilisateur du 2026-10-06, points 2.3 et 2.4)."""

from django.db import migrations, models

TASK_NAME = "evenements.envoyer_rappels_paiement_evenements"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="10",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.evenements.tasks.envoyer_rappels_paiement_evenements",
            "crontab": schedule,
            "enabled": True,
            "description": "Rappel email des inscrits dont la participation n'est pas payée (échéance J-3 à J0).",  # noqa: E501
        },
    )


def supprimer_planification(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("evenements", "0009_cout_non_membre"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.AddField("evenement", "date_fin", models.DateField(blank=True, null=True)),
        migrations.AddField("evenement", "heure_fin", models.TimeField(blank=True, null=True)),
        migrations.AddField(
            "evenement",
            "date_limite_paiement",
            models.DateField(
                blank=True,
                null=True,
                help_text="Date limite pour régler la participation. Vide = pas d'échéance.",
            ),
        ),
        migrations.AddField(
            "inscription",
            "rappel_paiement_envoye_le",
            models.DateField(
                blank=True,
                null=True,
                help_text="Idempotence du rappel de paiement (un seul rappel par inscription).",
            ),
        ),
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

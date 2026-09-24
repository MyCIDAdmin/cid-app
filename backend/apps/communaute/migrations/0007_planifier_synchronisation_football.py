"""
Data migration — planifie la synchronisation périodique du classement/calendrier Fan-Club
(module "Fan-Club", 2026-09-24 ; fournisseur de données changé deux fois le même jour :
TheSportsDB → API-Football → SerpApi/Google Sports, voir docstring de tête services.py)
dans django-celery-beat, même principe que
apps.evenements.migrations.0002_planifier_rappels_evenements (voir son docstring pour
le détail du fonctionnement de DatabaseScheduler).

Crée la planification initiale à toutes les 6 heures. NOTE (2026-09-24, même jour) : cette
fréquence s'est révélée trop optimiste une fois les besoins réels affinés par les tests
ad-hoc SerpApi — la synchronisation complète nécessite 3 requêtes SerpApi (tableau complet,
résultats récents, prochain match, voir services.py), pas une seule comme envisagé ici au
départ. Fréquence corrigée à 1x/jour par
migrations/0008_ajuster_frequence_sync_football_quotidienne.py — laissé tel quel ici plutôt
que réécrit, une migration de données déjà appliquée ne devant jamais être modifiée
rétroactivement (voir historique du projet).

Idempotent (get_or_create) et réversible (la tâche Celery elle-même, tasks.py, n'est pas
affectée par le retrait de sa planification).
"""

from django.db import migrations

TASK_NAME = "communaute.synchroniser_donnees_football"


def creer_planification(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="*/6",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.communaute.tasks.synchroniser_donnees_football",
            "crontab": schedule,
            "enabled": True,
            "description": (
                "Module Fan-Club — synchronise ClassementLigue/RencontreCalendrier depuis "
                "SerpApi/Google Sports toutes les 6h (voir services.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("communaute", "0006_classementligue_rencontrecalendrier_matchevenement_and_more"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

"""
Data migration — corrige la fréquence de synchronisation Fan-Club créée par
migrations/0007_planifier_synchronisation_football.py (toutes les 6h) à 1x/jour.

Contexte (2026-09-24, même jour que 0007) : les tests ad-hoc SerpApi (demandés
explicitement par l'utilisateur avant toute implémentation, voir services.py) ont montré
qu'une synchronisation complète (tableau COMPLET + résultats récents avec scores réels +
prochain match) nécessite 3 requêtes SerpApi, pas une seule comme envisagé par 0007. À
raison de 3 requêtes toutes les 6h, le quota gratuit SerpApi (250 recherches/mois) aurait
été dépassé (3 × 4/jour × 30 ≈ 360/mois) — décision utilisateur : repasser à 1x/jour
(3 × 30 ≈ 90/mois, large marge pour des tests manuels ponctuels).

Ne touche QUE le `CrontabSchedule` référencé par le `PeriodicTask` existant (`name`
inchangé, voir TASK_NAME) — la tâche Celery elle-même (tasks.py) n'est pas affectée.
Idempotent (get_or_create) et réversible (repasse sur le crontab "toutes les 6h" de 0007).
"""

from django.db import migrations

TASK_NAME = "communaute.synchroniser_donnees_football"

# Exécuté à 3h du matin (Europe/Berlin) — hors heures d'affluence, avant que les membres ne
# consultent le Fan-Club le matin.
HEURE_QUOTIDIENNE = "3"


def passer_a_quotidien(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour=HEURE_QUOTIDIENNE,
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.filter(name=TASK_NAME).update(
        crontab=schedule,
        description=(
            "Module Fan-Club — synchronise ClassementLigue/RencontreCalendrier depuis "
            "SerpApi/Google Sports 1x/jour, 3 requêtes par exécution (voir services.py)."
        ),
    )


def revenir_a_toutes_les_6h(apps, schema_editor):
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
    PeriodicTask.objects.filter(name=TASK_NAME).update(
        crontab=schedule,
        description=(
            "Module Fan-Club — synchronise ClassementLigue/RencontreCalendrier depuis "
            "SerpApi/Google Sports toutes les 6h (voir services.py)."
        ),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("communaute", "0007_planifier_synchronisation_football"),
    ]

    operations = [
        migrations.RunPython(passer_a_quotidien, revenir_a_toutes_les_6h),
    ]

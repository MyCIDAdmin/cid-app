"""
Data migration — planifie la clôture automatique des sessions de vote expirées (Timeline
Phase 3 : "Clôture auto Celery Beat (chaque minute : sessions expirées → clôture +
broadcast résultats)") dans django-celery-beat (DatabaseScheduler), même principe que
apps.evenements.migrations.0002_planifier_rappels_evenements (voir son docstring) — mais
avec un IntervalSchedule (chaque minute) plutôt qu'un CrontabSchedule (heure fixe
quotidienne), puisqu'il s'agit ici d'un polling à haute fréquence plutôt que d'un rendez-
vous journalier.

Idempotent (get_or_create) et réversible (la tâche Celery elle-même, tasks.py, n'est pas
affectée par le retrait de sa planification)."""
from django.db import migrations

TASK_NAME = "vote.clore_sessions_expirees"


def creer_planification(apps, schema_editor):
    IntervalSchedule = apps.get_model("django_celery_beat", "IntervalSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    # Modèle historique (apps.get_model) : pas d'accès à IntervalSchedule.MINUTES
    # (attribut de classe défini sur le vrai modèle, absent de l'état figé de la
    # migration) — on utilise donc la valeur littérale "minutes" (django-celery-beat).
    schedule, _created = IntervalSchedule.objects.get_or_create(every=1, period="minutes")
    PeriodicTask.objects.get_or_create(
        name=TASK_NAME,
        defaults={
            "task": "apps.vote.tasks.clore_sessions_expirees",
            "interval": schedule,
            "enabled": True,
            "description": (
                "Timeline Phase 3 — clôture automatique de toute VoteSession OUVERTE dont "
                "date_fin est dépassée, calcul + diffusion WebSocket des résultats (voir "
                "tasks.py)."
            ),
        },
    )


def supprimer_planification(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=TASK_NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("vote", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(creer_planification, supprimer_planification),
    ]

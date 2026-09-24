"""
Data migration — termine la bascule du module Fan-Club vers GOAL API (voir
0009_migrer_vers_goal_api_schema.py et la docstring de tête de services.py).

Deux actions, dans le même esprit que 0007/0008 (planification) :

1. Purge `RencontreCalendrier`/`ClassementLigue` : les identifiants externes SerpApi
   (`evenement_externe_id` = "kgmid" Google) sont dans un espace de noms totalement
   disjoint de ceux de GOAL API (CUID) — l'upsert (`update_or_create`) du nouveau service
   ne les reconnaîtra donc jamais, et ces anciennes lignes resteraient affichées
   indéfiniment aux côtés des nouvelles (calendrier partiel SerpApi vs. calendrier complet
   GOAL API) sans jamais être mises à jour ni supprimées. Repart d'une table vide,
   entièrement reconstruite au prochain déclenchement de la tâche Celery
   `synchroniser_donnees_football` — ces tables sont un cache synchronisé, jamais éditées
   manuellement (voir docstring de tête models.py), la suppression est donc sans perte
   réelle. Irréversible en pratique (la réversion ne peut pas deviner les anciennes
   données) : `reverse_code` volontairement un no-op, comme documenté ci-dessous.

2. Ajuste la fréquence de la tâche planifiée : GOAL API (1000 requêtes/jour gratuites)
   autorise un rythme bien plus soutenu que SerpApi (250 recherches/mois, d'où le passage à
   1x/jour par 0008) — une synchronisation complète fait ~7 requêtes (1 classement + ~4
   pages de calendrier + ~2 pages d'effectif, voir services.py), donc à 1x/3h
   (8x/jour) ≈ 56 requêtes/jour, large marge sous le quota gratuit tout en gardant les
   données sensiblement plus fraîches qu'à 1x/jour.
"""

from django.db import migrations

TASK_NAME = "communaute.synchroniser_donnees_football"


def purger_donnees_serpapi(apps, schema_editor):
    RencontreCalendrier = apps.get_model("communaute", "RencontreCalendrier")
    ClassementLigue = apps.get_model("communaute", "ClassementLigue")
    RencontreCalendrier.objects.all().delete()
    ClassementLigue.objects.all().delete()


def ne_rien_faire(apps, schema_editor):
    # Irréversible en pratique (voir docstring de tête) — les anciennes lignes SerpApi ne
    # peuvent pas être reconstituées, et les nouvelles lignes GOAL API restent de toute
    # façon reconstructibles à tout moment par la tâche Celery.
    pass


def passer_a_toutes_les_3h(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="*/3",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="Europe/Berlin",
    )
    PeriodicTask.objects.filter(name=TASK_NAME).update(
        crontab=schedule,
        description=(
            "Module Fan-Club — synchronise ClassementLigue/RencontreCalendrier/"
            "StatistiqueJoueur depuis GOAL API toutes les 3h (voir services.py)."
        ),
    )


def revenir_a_quotidien(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")

    schedule, _created = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="3",
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


class Migration(migrations.Migration):
    dependencies = [
        ("communaute", "0009_migrer_vers_goal_api_schema"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [
        migrations.RunPython(purger_donnees_serpapi, ne_rien_faire),
        migrations.RunPython(passer_a_toutes_les_3h, revenir_a_quotidien),
    ]

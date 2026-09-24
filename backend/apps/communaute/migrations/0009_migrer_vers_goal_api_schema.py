"""
Migration de schéma — bascule du module Fan-Club de SerpApi/Google Sports vers GOAL API
(goal-api.com), décision utilisateur "Komplett auf GOAL API umstellen" (2026-09-24, voir
docstring de tête apps/communaute/services.py).

Ajoute les champs nécessaires pour exploiter les données désormais disponibles via GOAL
API et absentes de SerpApi : répartition domicile/extérieur native du classement
(`ClassementLigue.*_domicile`/`*_exterieur`/`zone_texte`), statut fiable d'une rencontre
(`RencontreCalendrier.statut`, GOAL API expose un calendrier complet avec `matchStatus`
explicite — SerpApi ne renvoyait qu'une poignée de matchs sans statut), et statistiques
individuelles par joueur (`StatistiqueJoueur`, nouveau modèle — alimente les listes
Torschützen/Kartenstatistik, impossibles sous SerpApi faute de données joueur pour la
Ligue 1 tunisienne).

Purement additive (nouveaux champs avec valeur par défaut, nouveau modèle) : aucune donnée
existante n'est perdue par cette migration — voir 0010_migrer_vers_goal_api_donnees.py pour
le nettoyage des lignes obsolètes issues de SerpApi (identifiants externes disjoints, non
réutilisables par l'upsert GOAL API) et l'ajustement de la planification Celery Beat.
"""

import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communaute", "0008_ajuster_frequence_sync_football_quotidienne"),
    ]

    operations = [
        migrations.CreateModel(
            name="StatistiqueJoueur",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("goal_api_id", models.CharField(max_length=50, unique=True)),
                ("saison", models.CharField(help_text='Ex. "2025-2026".', max_length=20)),
                ("equipe", models.CharField(max_length=200)),
                ("nom", models.CharField(max_length=200)),
                ("numero", models.PositiveSmallIntegerField(blank=True, null=True)),
                ("poste", models.CharField(blank=True, max_length=50)),
                ("matchs_joues", models.PositiveSmallIntegerField(default=0)),
                ("buts", models.PositiveSmallIntegerField(default=0)),
                ("passes_decisives", models.PositiveSmallIntegerField(default=0)),
                ("cartons_jaunes", models.PositiveSmallIntegerField(default=0)),
                ("cartons_rouges", models.PositiveSmallIntegerField(default=0)),
                ("maj_le", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Statistique joueur",
                "verbose_name_plural": "Statistiques joueurs",
                "db_table": "communaute_statistiques_joueurs",
                "ordering": ["-buts", "nom"],
            },
        ),
        migrations.AddField(
            model_name="classementligue",
            name="buts_contre_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="buts_contre_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="buts_pour_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="buts_pour_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="defaites_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="defaites_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="joues_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="joues_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="nuls_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="nuls_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="points_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="points_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="victoires_domicile",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="victoires_exterieur",
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="classementligue",
            name="zone_texte",
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name="rencontrecalendrier",
            name="statut",
            field=models.CharField(
                choices=[
                    ("SCHEDULED", "Programmée"),
                    ("FINISHED", "Terminée"),
                    ("POSTPONED", "Reportée"),
                    ("CANCELLED", "Annulée"),
                ],
                default="SCHEDULED",
                max_length=20,
            ),
        ),
    ]

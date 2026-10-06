import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("membres", "0001_initial"),
        ("projets", "0005_plankosten"),
    ]

    operations = [
        migrations.CreateModel(
            name="ProjetAktivitaet",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("zeitpunkt", models.DateTimeField(auto_now_add=True)),
                ("akteur_name", models.CharField(blank=True, max_length=200)),
                (
                    "aktion",
                    models.CharField(
                        choices=[
                            ("aufgabe_erstellt", "Tâche créée"),
                            ("aufgabe_verschoben", "Tâche déplacée"),
                            ("aufgabe_zugewiesen", "Tâche assignée"),
                            ("aufgabe_geloescht", "Tâche supprimée"),
                            ("aufgabe_kommentiert", "Tâche commentée"),
                            ("team_hinzugefuegt", "Membre ajouté"),
                            ("team_rolle", "Rôle modifié"),
                            ("team_entfernt", "Membre retiré"),
                            ("sichtbarkeit", "Visibilité modifiée"),
                            ("plan_gesetzt", "Coût prévu défini"),
                            ("plan_entfernt", "Coût prévu retiré"),
                            ("kosten_erfasst", "Coût saisi"),
                            ("kosten_geloescht", "Coût supprimé"),
                        ],
                        max_length=30,
                    ),
                ),
                ("objekt", models.CharField(blank=True, max_length=200)),
                ("detail", models.CharField(blank=True, max_length=200)),
                (
                    "akteur",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="membres.membre",
                    ),
                ),
                (
                    "projet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="aktivitaeten",
                        to="projets.projet",
                    ),
                ),
            ],
            options={
                "verbose_name": "Activité du projet",
                "verbose_name_plural": "Activités du projet",
                "db_table": "projets_aktivitaeten",
                "ordering": ["-zeitpunkt", "id"],
            },
        ),
        migrations.AddIndex(
            model_name="projetaktivitaet",
            index=models.Index(fields=["projet", "-zeitpunkt"], name="projets_akt_proj_zeit_idx"),
        ),
    ]

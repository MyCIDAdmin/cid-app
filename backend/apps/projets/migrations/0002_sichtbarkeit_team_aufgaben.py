import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("membres", "0001_initial"),
        ("projets", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="projet",
            name="sichtbarkeit",
            field=models.CharField(
                choices=[("entwurf", "Brouillon"), ("veroeffentlicht", "Publié")],
                default="entwurf",
                max_length=20,
                verbose_name="Visibilité",
            ),
        ),
        migrations.AddIndex(
            model_name="projet",
            index=models.Index(fields=["sichtbarkeit"], name="projets_proj_sichtbk_idx"),
        ),
        migrations.CreateModel(
            name="ProjetMitglied",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                (
                    "rolle",
                    models.CharField(
                        choices=[
                            ("leitung", "Direction"),
                            ("mitarbeit", "Collaboration"),
                            ("beobachter", "Observateur"),
                        ],
                        default="mitarbeit",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "membre",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="projekt_mitgliedschaften",
                        to="membres.membre",
                    ),
                ),
                (
                    "projet",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="team",
                        to="projets.projet",
                    ),
                ),
            ],
            options={
                "verbose_name": "Membre de l'équipe projet",
                "verbose_name_plural": "Équipes projet",
                "db_table": "projets_team",
                "ordering": ["created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="projetmitglied",
            constraint=models.UniqueConstraint(
                fields=("projet", "membre"), name="projets_team_unique_membre"
            ),
        ),
        migrations.CreateModel(
            name="Aufgabe",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("titel", models.CharField(max_length=200)),
                ("beschreibung", models.TextField(blank=True)),
                ("frist", models.DateField(blank=True, null=True)),
                (
                    "prioritaet",
                    models.CharField(
                        choices=[
                            ("niedrig", "Basse"),
                            ("normal", "Normale"),
                            ("hoch", "Haute"),
                        ],
                        default="normal",
                        max_length=10,
                    ),
                ),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("offen", "Ouverte"),
                            ("in_arbeit", "En cours"),
                            ("review", "En revue"),
                            ("erledigt", "Terminée"),
                        ],
                        default="offen",
                        max_length=12,
                    ),
                ),
                ("ordre", models.PositiveIntegerField(default=0)),
                ("erledigt_am", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "created_by",
                    models.ForeignKey(
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
                        related_name="aufgaben",
                        to="projets.projet",
                    ),
                ),
                (
                    "verantwortlich",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="projekt_aufgaben",
                        to="membres.membre",
                    ),
                ),
            ],
            options={
                "verbose_name": "Tâche de projet",
                "verbose_name_plural": "Tâches de projet",
                "db_table": "projets_aufgaben",
                "ordering": ["ordre", "created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="aufgabe",
            index=models.Index(fields=["projet", "status"], name="projets_aufg_proj_status_idx"),
        ),
        migrations.CreateModel(
            name="AufgabeKommentar",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("text", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "aufgabe",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="kommentare",
                        to="projets.aufgabe",
                    ),
                ),
                (
                    "autor",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="membres.membre",
                    ),
                ),
            ],
            options={
                "verbose_name": "Commentaire de tâche",
                "verbose_name_plural": "Commentaires de tâche",
                "db_table": "projets_aufgaben_kommentare",
                "ordering": ["created_at"],
            },
        ),
    ]

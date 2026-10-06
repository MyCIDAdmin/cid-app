from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("projets", "0006_aktivitaeten")]

    operations = [
        migrations.AddField(
            model_name="projet",
            name="plan_jahr",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="projetaktivitaet",
            name="aktion",
            field=models.CharField(
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
                    ("planjahr", "Année de planification modifiée"),
                    ("kosten_erfasst", "Coût saisi"),
                    ("kosten_geloescht", "Coût supprimé"),
                ],
                max_length=30,
            ),
        ),
    ]

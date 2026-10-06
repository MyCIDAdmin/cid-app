"""
Data migration — reprise des projets existants (2026-10-06) :
  - "en_preparation" -> Brouillon, tous les autres -> Publié (aucun changement visible pour les
    membres : l'ancienne règle masquait déjà "en_preparation").
  - le·la responsable existant·e devient Direction de l'équipe du projet.
"""
from django.db import migrations


def reprendre(apps, schema_editor):
    Projet = apps.get_model("projets", "Projet")
    ProjetMitglied = apps.get_model("projets", "ProjetMitglied")
    Projet.objects.exclude(statut="en_preparation").update(sichtbarkeit="veroeffentlicht")
    for projet in Projet.objects.exclude(responsable__isnull=True):
        ProjetMitglied.objects.get_or_create(
            projet=projet, membre_id=projet.responsable_id, defaults={"rolle": "leitung"}
        )


class Migration(migrations.Migration):
    dependencies = [("projets", "0002_sichtbarkeit_team_aufgaben")]

    operations = [migrations.RunPython(reprendre, migrations.RunPython.noop)]

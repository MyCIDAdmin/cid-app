"""Data migration — Startkategorien für Hilfegesuche (Nov. 2026), danach vom Bureau Admin pflegbar."""
from django.db import migrations

KATEGORIEN = [
    ("Fest & Organisation", "Fêtes & organisation"),
    ("Technik & Web", "Technique & web"),
    ("Kinder & Jugend", "Enfants & jeunesse"),
    ("Reisen & Fahrten", "Voyages & trajets"),
    ("Fan-Club & Stadion", "Fan-club & stade"),
    ("Verwaltung & Büro", "Administration & bureau"),
    ("Sonstiges", "Autres"),
]


def anlegen(apps, schema_editor):
    HilfeKategorie = apps.get_model("projets", "HilfeKategorie")
    for position, (de, fr) in enumerate(KATEGORIEN, start=1):
        HilfeKategorie.objects.get_or_create(
            name_de=de, defaults={"name_fr": fr, "reihenfolge": position * 10}
        )


def entfernen(apps, schema_editor):
    HilfeKategorie = apps.get_model("projets", "HilfeKategorie")
    HilfeKategorie.objects.filter(name_de__in=[de for de, _fr in KATEGORIEN]).delete()


class Migration(migrations.Migration):
    dependencies = [("projets", "0013_hilfe_kategorien_angebote")]
    operations = [migrations.RunPython(anlegen, entfernen)]

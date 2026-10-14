# Startdaten (Release 26, 2026-10-14): die vier ersten Regionen mit der Zuordnung der Bundesländer.
# Der App Admin kann alles später ändern. Hessen, Rheinland-Pfalz und Saarland bleiben bewusst
# ohne Region, bis der App Admin sie zuordnet.
from django.db import migrations

STARTREGIONEN = [
    ("nord", "Nord", "#0e7490", 1, ["HH", "HB", "SH", "NI", "MV"]),
    ("nrw", "NRW", "#b91c1c", 2, ["NW"]),
    ("berlin", "Berlin", "#a16207", 3, ["BE", "BB", "SN", "ST", "TH"]),
    ("muenchen", "München", "#15803d", 4, ["BY", "BW"]),
]


def anlegen(apps, schema_editor):
    Region = apps.get_model("regionen", "Region")
    RegionLand = apps.get_model("regionen", "RegionLand")
    for slug, name, farbe, reihenfolge, laender in STARTREGIONEN:
        region, _ = Region.objects.get_or_create(
            slug=slug, defaults={"name": name, "farbe": farbe, "reihenfolge": reihenfolge}
        )
        for land in laender:
            RegionLand.objects.get_or_create(land=land, defaults={"region": region})


def entfernen(apps, schema_editor):
    apps.get_model("regionen", "Region").objects.filter(
        slug__in=[r[0] for r in STARTREGIONEN]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [("regionen", "0001_initial")]
    operations = [migrations.RunPython(anlegen, entfernen)]

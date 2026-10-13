# Seed der Matrix für die Verwaltungsseiten des Kalenders (Release 15, 2026-10-13):
# page_kalender         : RH Lesen, Bureau Admin und höher Lesen+Schreiben, Mitglieder kein Zugriff.
# page_kalender_vorschlag: nur Bureau Admin und höher (Termine vorschlagen) ; für einzelne Personen
#                          vergibt der App-Admin die Seite über eine zusätzliche Rolle.
from django.db import migrations

NIVEAUX = {
    "page_kalender": {
        "membre": "aucun",
        "rh": "lecture",
        "bureau_admin": "lecture_ecriture",
        "dir_financier": "lecture_ecriture",
        "super_admin": "lecture_ecriture",
    },
    "page_kalender_vorschlag": {
        "membre": "aucun",
        "rh": "aucun",
        "bureau_admin": "lecture_ecriture",
        "dir_financier": "lecture_ecriture",
        "super_admin": "lecture_ecriture",
    },
}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    for seite, stufen in NIVEAUX.items():
        for slug, niveau in stufen.items():
            role = RoleDefinition.objects.filter(slug=slug, is_system=True).first()
            if role is not None:
                RoleModulePermission.objects.get_or_create(
                    role=role, module=seite, defaults={"niveau_acces": niveau}
                )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0008_seed_page_zahlungen_import")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

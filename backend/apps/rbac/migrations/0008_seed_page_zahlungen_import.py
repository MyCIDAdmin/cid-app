# Seed der Matrix für die neue Verwaltungsseite `page_zahlungen_import` (Release 3, 2026-10-12):
# Directeur Financier und höher -> Lesen+Schreiben, Bureau Admin -> Lesen, übrige -> kein Zugriff.
from django.db import migrations

NIVEAUX = {
    "membre": "aucun",
    "rh": "aucun",
    "bureau_admin": "lecture",
    "dir_financier": "lecture_ecriture",
    "super_admin": "lecture_ecriture",
}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    for slug, niveau in NIVEAUX.items():
        role = RoleDefinition.objects.filter(slug=slug, is_system=True).first()
        if role is not None:
            RoleModulePermission.objects.get_or_create(
                role=role, module="page_zahlungen_import", defaults={"niveau_acces": niveau}
            )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0007_seed_weitere_verwaltungsseiten")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

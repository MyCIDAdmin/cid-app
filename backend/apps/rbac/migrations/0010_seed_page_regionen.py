# Seed der Matrix für die Seite „Regionen“ (Release 26, 2026-10-14):
# page_regionen : Büro (Bureau Admin) und höher dürfen Verantwortliche zuweisen und Regionsseiten
#                 bearbeiten ; RH nur Lesen ; Mitglieder kein Zugriff. Die Verantwortlichen selbst
#                 brauchen diese Seite nicht (sie bearbeiten ihre eigene Region).
from django.db import migrations

NIVEAUX = {
    "membre": "aucun",
    "rh": "lecture",
    "bureau_admin": "lecture_ecriture",
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
                role=role, module="page_regionen", defaults={"niveau_acces": niveau}
            )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0009_seed_page_kalender")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

# Seed der Matrix für die Seite „Support“ (Release 33, 2026-10-15):
# page_support : Büro (Bureau Admin) und höher bearbeiten Tickets und pflegen die FAQ ; RH nur
#                Lesen ; Mitglieder kein Zugriff (Tickets eröffnen darf jedes angemeldete Konto).
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
                role=role, module="page_support", defaults={"niveau_acces": niveau}
            )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0010_seed_page_regionen")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

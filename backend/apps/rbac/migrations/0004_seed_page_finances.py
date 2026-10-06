# Seed de la matrice pour la nouvelle page de gestion `page_finances` (2026-10-06) :
# Directeur Financier et au-dessus → lecture_ecriture, Bureau Admin → lecture, autres → aucun.
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
                role=role, module="page_finances", defaults={"niveau_acces": niveau}
            )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0003_seed_pages_admin_matrice")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

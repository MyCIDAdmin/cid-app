# Hilfe gesucht (Nov. 2026): zwei neue Seiten der Rechtematrix.
#   page_hilfe_veroeffentlichen  RH und höher (Gesuche anlegen)
#   page_hilfe_genehmigen        Büro (Bureau Admin) und höher (Meldungen genehmigen)
# Der App Admin hat beide Seiten immer ; weitere Personen bekommen sie über eine zusätzliche Rolle.
from django.db import migrations

LECTURE_ECRITURE, AUCUN = "lecture_ecriture", "aucun"
STUFE_ROLLE = {"membre": 1, "rh": 2, "bureau_admin": 3, "dir_financier": 4, "super_admin": 5}
SEITEN_AB_STUFE = {"page_hilfe_veroeffentlichen": 2, "page_hilfe_genehmigen": 3}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    for slug, stufe in STUFE_ROLLE.items():
        role = RoleDefinition.objects.filter(slug=slug, is_system=True).first()
        if role is None:
            continue
        for seite, ab in SEITEN_AB_STUFE.items():
            RoleModulePermission.objects.get_or_create(
                role=role,
                module=seite,
                defaults={"niveau_acces": LECTURE_ECRITURE if stufe >= ab else AUCUN},
            )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0013_seed_seiten_statt_rollenstufen")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

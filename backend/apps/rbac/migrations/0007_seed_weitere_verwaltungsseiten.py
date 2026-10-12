# Seed der Matrix für 5 bisher fest an ROLE_LEVELS gebundene Verwaltungsseiten (2026-10-12).
# Die Startwerte entsprechen exakt dem bisherigen Verhalten, damit sich beim Deploy nichts ändert:
#   page_partner            Lesen ab RH, Pflegen ab Bureau Admin (PartnerPermission)
#   page_membres_import     RH und höher (IsRHOrAbove)
#   page_membres_zuordnung  RH und höher (IsRHOrAbove)
#   page_configuration_site Bureau Admin und höher
#   page_fan_club_logos     Bureau Admin und höher
from django.db import migrations

L, LS, A = "lecture", "lecture_ecriture", "aucun"

SEED = {
    "page_partner": {
        "membre": A, "rh": L, "bureau_admin": LS, "dir_financier": LS, "super_admin": LS,
    },
    "page_membres_import": {
        "membre": A, "rh": LS, "bureau_admin": LS, "dir_financier": LS, "super_admin": LS,
    },
    "page_membres_zuordnung": {
        "membre": A, "rh": LS, "bureau_admin": LS, "dir_financier": LS, "super_admin": LS,
    },
    "page_configuration_site": {
        "membre": A, "rh": A, "bureau_admin": LS, "dir_financier": LS, "super_admin": LS,
    },
    "page_fan_club_logos": {
        "membre": A, "rh": A, "bureau_admin": LS, "dir_financier": LS, "super_admin": LS,
    },
}


def seed(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    for page, niveaux in SEED.items():
        for slug, niveau in niveaux.items():
            role = RoleDefinition.objects.filter(slug=slug, is_system=True).first()
            if role is not None:
                RoleModulePermission.objects.get_or_create(
                    role=role, module=page, defaults={"niveau_acces": niveau}
                )


class Migration(migrations.Migration):
    dependencies = [("rbac", "0006_visibilite_par_entree_de_menu")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

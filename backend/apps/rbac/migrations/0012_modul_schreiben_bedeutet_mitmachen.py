# Rechte-Umbau (Nov. 2026) : Schreiben auf einem Modul = mitmachen (abstimmen, beitragen,
# reagieren ...), Lesen = nur ansehen. Bisher durfte jedes angemeldete Konto in "Abstimmungen"
# und "Projekte" mitmachen, obwohl die Matrix dort nur "Lesen" vorsah (Startwert). Damit der
# Deploy nichts verändert, werden diese Zellen bei den Systemrollen auf "Lesen & Schreiben"
# angehoben. Wer eine Zelle bewusst auf "Kein Zugriff" gesetzt hat, bleibt unberührt ; Absenken
# kann die Verwaltung danach in der Matrix.
from django.db import migrations

MODULE = ("vote", "projets")
SYSTEMROLLEN = ("membre", "rh", "bureau_admin", "dir_financier", "super_admin")


def anheben(apps, schema_editor):
    RoleDefinition = apps.get_model("rbac", "RoleDefinition")
    RoleModulePermission = apps.get_model("rbac", "RoleModulePermission")
    for slug in SYSTEMROLLEN:
        role = RoleDefinition.objects.filter(slug=slug, is_system=True).first()
        if role is None:
            continue
        for modul in MODULE:
            zelle, erstellt = RoleModulePermission.objects.get_or_create(
                role=role, module=modul, defaults={"niveau_acces": "lecture_ecriture"}
            )
            if not erstellt and zelle.niveau_acces == "lecture":
                zelle.niveau_acces = "lecture_ecriture"
                zelle.save(update_fields=["niveau_acces"])


class Migration(migrations.Migration):
    dependencies = [("rbac", "0011_seed_page_support")]
    operations = [migrations.RunPython(anheben, migrations.RunPython.noop)]

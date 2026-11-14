# Rechte-Umbau (Nov. 2026): feste Rollenstufen im Code werden zu Seiten der Matrix. Die Startwerte
# bilden das bisherige Verhalten exakt ab, damit der Deploy nichts ändert.
#
#   page_membres              RH und höher     (Mitglieder sehen, anlegen, Status ändern)
#   page_membres_loeschen     Büro und höher
#   page_beitraege_uebersicht RH und höher
#   page_souscriptions        RH und höher
#   page_abstimmungen         nur Büro (Bureau Admin) und App Admin ; RH und Finanzen NICHT
#   page_community            Büro und höher
#   page_tippspiel            nur App Admin
#   page_zahlung_versand      Finanzen und höher
#   page_erfassung_fuer_andere Finanzen und höher (für andere erfassen)
#
# Zusätzlich: bisher durfte jedes ZUSÄTZLICHE Rollenkonto mit "Lesen" auf dem Modul alle Daten
# sehen (is_elevated_for_module). Diese Bedeutung wandert auf die Verwaltungsseite ; damit sich
# für bestehende eigene Rollen nichts ändert, erhalten sie "Lesen" auf der zugehörigen Seite.
from django.db import migrations

AUCUN, LECTURE, LECTURE_ECRITURE = "aucun", "lecture", "lecture_ecriture"
RANG = {AUCUN: 0, LECTURE: 1, LECTURE_ECRITURE: 2}

STUFE_ROLLE = {"membre": 1, "rh": 2, "bureau_admin": 3, "dir_financier": 4, "super_admin": 5}

# Seite -> Rollen, die sie bisher faktisch hatten (Mindeststufe) oder explizite Liste.
SEITEN_AB_STUFE = {
    "page_membres": 2,
    "page_membres_loeschen": 3,
    "page_beitraege_uebersicht": 2,
    "page_souscriptions": 2,
    "page_community": 3,
    "page_tippspiel": 5,
    "page_zahlung_versand": 4,
    "page_erfassung_fuer_andere": 4,
}
SEITEN_EXPLIZIT = {"page_abstimmungen": {"bureau_admin", "super_admin"}}

# Modul -> Seite, deren "Lesen" die frühere Bedeutung "alle Daten sehen" übernimmt.
ALLE_DATEN_SEITE = {
    "membres": "page_membres",
    "cotisations": "page_beitraege_uebersicht",
    "adhesions": "page_souscriptions",
    "evenements": "page_events",
    "boutique": "page_boutique",
}


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
        for seite, rollen in SEITEN_EXPLIZIT.items():
            RoleModulePermission.objects.get_or_create(
                role=role,
                module=seite,
                defaults={"niveau_acces": LECTURE_ECRITURE if slug in rollen else AUCUN},
            )

    for role in RoleDefinition.objects.filter(is_system=False):
        for modul, seite in ALLE_DATEN_SEITE.items():
            modul_zelle = RoleModulePermission.objects.filter(role=role, module=modul).first()
            if modul_zelle is None or RANG[modul_zelle.niveau_acces] < RANG[LECTURE]:
                continue
            zelle, erstellt = RoleModulePermission.objects.get_or_create(
                role=role, module=seite, defaults={"niveau_acces": LECTURE}
            )
            if not erstellt and RANG[zelle.niveau_acces] < RANG[LECTURE]:
                zelle.niveau_acces = LECTURE
                zelle.save(update_fields=["niveau_acces"])


class Migration(migrations.Migration):
    dependencies = [("rbac", "0012_modul_schreiben_bedeutet_mitmachen")]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]

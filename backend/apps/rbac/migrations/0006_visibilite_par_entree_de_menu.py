# Migration de données (2026-10-11) — la visibilité se règle désormais par ENTRÉE de menu : les
# 5 entrées de la communauté (Fil, Forum, Nachrichten, Gruppen, Fan-Club), Quiz et
# Fahrgemeinschaften ont chacune leur clé. Pour ne rien changer tant qu'un admin n'a rien
# décidé, chaque nouvelle clé hérite des deux colonnes de l'ancienne clé groupée
# (`communaute` / `evenements`) — y compris une colonne "non-membre" restée vide (NULL =
# valeur par défaut, identique pour parent et enfants).
# Les anciennes lignes (communaute, cotisations, stats, notifications) restent en base, inutilisées.
from django.db import migrations

PARENT_LEGACY = {
    "fil": "communaute",
    "forum": "communaute",
    "messagerie": "communaute",
    "groupes": "communaute",
    "live": "communaute",
    "quiz": "communaute",
    "covoiturage": "evenements",
}


def heriter(apps, schema_editor):
    Ligne = apps.get_model("rbac", "ModuleVisibiliteMembre")
    parents = {ligne.module: ligne for ligne in Ligne.objects.all()}
    for cle, legacy in PARENT_LEGACY.items():
        parent = parents.get(legacy)
        if parent is None:
            continue
        Ligne.objects.get_or_create(
            module=cle,
            defaults={"visible": parent.visible, "visible_non_membre": parent.visible_non_membre},
        )


class Migration(migrations.Migration):

    dependencies = [
        ("rbac", "0005_seed_page_finances"),
    ]

    operations = [
        migrations.RunPython(heriter, migrations.RunPython.noop),
    ]
